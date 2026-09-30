import { createDiscogsRateLimiter, parseRetryAfter, type DiscogsRateLimiter } from './middleware/rateLimit.js';
import { fetchCompleteWantlist } from './discogsWantlist.js';
import { abortableDelay, deadlineSignal, responseBodyChunks, withAbort } from './requestCancellation.js';

const BASE_URL = 'https://api.discogs.com';
const MAX_RETRIES = 3;
const sharedWaitTurn = createDiscogsRateLimiter();

export type DiscogsRequestOptions = Pick<RequestInit, 'signal'>;
export type DiscogsClientConfig = {
  token: string;
  username: string;
  signal?: AbortSignal;
  deadlineMs?: number;
  attemptTimeoutMs?: number;
  waitTurn?: DiscogsRateLimiter;
};
type Instance = { folderId?: number; releaseId: number; instanceId: number };

function positiveTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
    throw new RangeError(`Discogs ${name} must be a positive bounded duration`);
  }
  return value;
}

async function readBody(response: Response, signal: AbortSignal): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of responseBodyChunks(response, signal)) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

class DiscogsClient {
  private readonly token: string;
  readonly username: string;
  private readonly signal?: AbortSignal;
  private readonly deadlineMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly waitTurn: DiscogsRateLimiter;

  constructor(config: DiscogsClientConfig) {
    this.token = config.token;
    this.username = config.username;
    this.signal = config.signal;
    this.deadlineMs = positiveTimeout(config.deadlineMs ?? 120_000, 'deadline');
    this.attemptTimeoutMs = positiveTimeout(config.attemptTimeoutMs ?? 30_000, 'attempt timeout');
    this.waitTurn = config.waitTurn ?? sharedWaitTurn;
  }

  ensureConfigured() {
    if (!this.token || !this.username) throw new Error('Discogs account is not configured');
  }

  async request(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    this.ensureConfigured();
    const context = `Discogs ${options.method ?? 'GET'} ${endpoint}`;
    const parents = [this.signal, options.signal].filter((signal): signal is AbortSignal => !!signal);
    const operation = deadlineSignal(this.deadlineMs, `${context}: application deadline exceeded`, parents);
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        operation.signal.throwIfAborted();
        await withAbort(this.waitTurn(operation.signal), operation.signal);
        operation.signal.throwIfAborted();
        const upstream = deadlineSignal(this.attemptTimeoutMs, `${context}: upstream attempt/body timeout`, [operation.signal]);
        let retryAfter: number | undefined;
        try {
          const headers = new Headers({
            'User-Agent': 'Discographic/1.0',
            Authorization: `Discogs token=${this.token}`,
            Accept: 'application/json',
          });
          new Headers(options.headers).forEach((value, key) => headers.set(key, value));
          const response = await withAbort(fetch(`${BASE_URL}${endpoint}`, {
            ...options, headers, signal: upstream.signal,
          }), upstream.signal);
          upstream.signal.throwIfAborted();
          if (response.status === 429) {
            retryAfter = parseRetryAfter(response);
            if (response.body) await withAbort(response.body.cancel(), upstream.signal);
            if (attempt >= MAX_RETRIES) throw new Error('Discogs 429: too many requests, retries exhausted');
          } else if (response.status === 204 || (response.ok && !response.headers.get('content-type')?.includes('application/json'))) {
            if (response.body) await withAbort(response.body.cancel(), upstream.signal);
            return null;
          } else {
            const text = await readBody(response, upstream.signal);
            if (!response.ok) throw new Error(`Discogs ${response.status}: ${text || 'request failed'}`);
            return JSON.parse(text) as unknown;
          }
        } finally {
          upstream.dispose();
        }
        // Only explicit 429 responses retry; network/body/write failures are ambiguous.
        await abortableDelay(retryAfter!, operation.signal);
      }
      throw new Error('Could not complete the Discogs request');
    } catch (error) {
      if (operation.signal.aborted) {
        const reason: unknown = operation.signal.reason;
        if (reason instanceof Error && reason.name === 'TimeoutError') {
          const message = reason.message.startsWith(`${context}:`) ? reason.message : `${context}: ${reason.message}`;
          const timeout = new Error(message, { cause: reason });
          timeout.name = 'TimeoutError';
          throw timeout;
        }
        throw new DOMException(`${context}: request cancelled`, 'AbortError');
      }
      throw error;
    } finally {
      operation.dispose();
    }
  }

  getCollection(page = 1, perPage = 100, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`, options
    );
  }

  getWantlist(page = 1, perPage = 100, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/wants?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`, options
    );
  }

  async getAllWantlist(perPage = 100, options: DiscogsRequestOptions = {}) {
    return fetchCompleteWantlist((page, pageSize) => this.getWantlist(page, pageSize, options), perPage);
  }

  getRelease(releaseId: number, options: DiscogsRequestOptions = {}) {
    return this.request(`/releases/${releaseId}`, options);
  }

  getCollectionValue(options: DiscogsRequestOptions = {}) {
    return this.request(`/users/${this.username}/collection/value`, options);
  }

  // Rating: POST to the instance endpoint with { rating }
  // https://www.discogs.com/developers/#page:user-collection,header:user-collection-change-rating-of-release
  updateRating({ folderId = 0, releaseId, instanceId, rating }: Instance & { rating: number }, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}`,
      {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      }
    );
  }

  // Notes: PUT to the field instance endpoint with { value }
  // https://www.discogs.com/developers/#page:user-collection,header:user-collection-edit-fields-instance
  updateField({ folderId = 0, releaseId, instanceId, fieldId, value }: Instance & { fieldId: number; value: string }, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}/fields/${fieldId}`,
      {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      }
    );
  }

  // Marketplace stats: lowest currently listed price in a given currency
  // https://www.discogs.com/developers/#page:marketplace,header:marketplace-release-statistics
  getMarketplaceStats(releaseId: number, currency = 'EUR', options: DiscogsRequestOptions = {}) {
    return this.request(`/marketplace/stats/${releaseId}?curr_abbr=${currency}`, options);
  }

  // User's marketplace inventory (items they have listed for sale)
  getInventory(page = 1, perPage = 100, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/inventory?page=${page}&per_page=${perPage}&sort=listed&sort_order=desc`, options
    );
  }

  // List custom fields for the user's collection
  getCustomFields(options: DiscogsRequestOptions = {}) {
    return this.request(`/users/${this.username}/collection/fields`, options);
  }

  // Suggested prices per condition grade; requires the user to have completed Discogs seller settings
  // https://www.discogs.com/developers/#page:marketplace,header:marketplace-price-suggestions
  getPriceSuggestions(releaseId: number, options: DiscogsRequestOptions = {}) {
    return this.request(`/marketplace/price_suggestions/${releaseId}`, options);
  }

  getCollectionFolders(options: DiscogsRequestOptions = {}) {
    return this.request(`/users/${this.username}/collection/folders`, options);
  }

  // Moving an instance: POST to its current folder with the destination folder_id
  // https://www.discogs.com/developers/#page:user-collection,header:user-collection-change-rating-of-release
  moveToFolder({ folderId = 0, releaseId, instanceId, targetFolderId }: Instance & { targetFolderId: number }, options: DiscogsRequestOptions = {}) {
    return this.request(
      `/users/${this.username}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}`,
      {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: targetFolderId })
      }
    );
  }

  // Every pressing/edition that belongs to one master release
  // https://www.discogs.com/developers/#page:database,header:database-master-release-versions
  getMasterVersions(masterId: number, page = 1, perPage = 100, options: DiscogsRequestOptions = {}) {
    return this.request(`/masters/${masterId}/versions?page=${page}&per_page=${perPage}&sort=released&sort_order=asc`, options);
  }
}

export function createDiscogsClient(config: DiscogsClientConfig) {
  return new DiscogsClient(config);
}
