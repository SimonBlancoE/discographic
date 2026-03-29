import { createDiscogsRateLimiter, parseRetryAfter } from './middleware/rateLimit.js';

const BASE_URL = 'https://api.discogs.com';
const MAX_RETRIES = 3;
const sharedWaitTurn = createDiscogsRateLimiter();

class DiscogsClient {
  constructor({ token, username }) {
    this.token = token;
    this.username = username;
  }

  ensureConfigured() {
    if (!this.token || !this.username) {
      throw new Error('Discogs account is not configured');
    }
  }

  async request(endpoint, options = {}) {
    this.ensureConfigured();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await sharedWaitTurn();

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'User-Agent': 'Discographic/1.0',
          Authorization: `Discogs token=${this.token}`,
          Accept: 'application/json',
          ...options.headers
        }
      });

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) {
          throw new Error('Discogs 429: too many requests, retries exhausted');
        }
        const waitMs = parseRetryAfter(response);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Discogs ${response.status}: ${text || 'request failed'}`);
      }

      // Some endpoints return empty 200
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }

      return response.json();
    }

    throw new Error('Could not complete the Discogs request');
  }

  getCollection(page = 1, perPage = 100) {
    return this.request(
      `/users/${this.username}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`
    );
  }

  getRelease(releaseId) {
    return this.request(`/releases/${releaseId}`);
  }

  getCollectionValue() {
    return this.request(`/users/${this.username}/collection/value`);
  }

  // Rating: POST to the instance endpoint with { rating }
  // https://www.discogs.com/developers/#page:user-collection,header:user-collection-change-rating-of-release
  updateRating({ folderId = 0, releaseId, instanceId, rating }) {
    return this.request(
      `/users/${this.username}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      }
    );
  }

  // Notes: PUT to the field instance endpoint with { value }
  // https://www.discogs.com/developers/#page:user-collection,header:user-collection-edit-fields-instance
  updateField({ folderId = 0, releaseId, instanceId, fieldId, value }) {
    return this.request(
      `/users/${this.username}/collection/folders/${folderId}/releases/${releaseId}/instances/${instanceId}/fields/${fieldId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      }
    );
  }

  // Marketplace stats: lowest currently listed price in a given currency
  // https://www.discogs.com/developers/#page:marketplace,header:marketplace-release-statistics
  getMarketplaceStats(releaseId, currency = 'EUR') {
    return this.request(`/marketplace/stats/${releaseId}?curr_abbr=${currency}`);
  }

  // List custom fields for the user's collection
  getCustomFields() {
    return this.request(`/users/${this.username}/collection/fields`);
  }
}

export function createDiscogsClient(config) {
  return new DiscogsClient(config);
}
