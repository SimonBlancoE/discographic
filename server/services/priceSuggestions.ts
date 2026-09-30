import { createUserJobScope, registerUserJobCanceller } from './userJobs.js';
import type { PriceSuggestion, PriceSuggestionsResponse } from '../../shared/contracts/priceSuggestions.js';
import { DEFAULT_MEDIA_CONDITIONS } from '../../shared/contracts/collectionFields.js';

type PriceSuggestionsClient = {
  getPriceSuggestions: (releaseId: number) => Promise<unknown>;
};

type RawSuggestions = {
  currency: string;
  suggestions: PriceSuggestion[];
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { fetchedAt: number; value: RawSuggestions }>();

registerUserJobCanceller(userId => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
});

/**
 * Discogs answers `{ "Mint (M)": { "currency": "EUR", "value": 12.5 }, ... }` with one entry per grade.
 * Entries are returned best grade first so the UI can render them as a scale.
 */
export function parsePriceSuggestions(payload: unknown): RawSuggestions | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  let currency: string | null = null;
  const suggestions: PriceSuggestion[] = [];

  for (const [condition, entry] of Object.entries(payload as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const { value, currency: entryCurrency } = entry as { value?: unknown; currency?: unknown };
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    currency ??= typeof entryCurrency === 'string' ? entryCurrency.toUpperCase() : null;
    suggestions.push({ condition, value: amount });
  }

  if (!suggestions.length || !currency) {
    return null;
  }

  const rank = (condition: string) => {
    const index = DEFAULT_MEDIA_CONDITIONS.indexOf(condition);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  suggestions.sort((a, b) => rank(a.condition) - rank(b.condition));
  return { currency, suggestions };
}

function isSellerSettingsError(error: unknown): boolean {
  return error instanceof Error && /seller settings/i.test(error.message);
}

export async function getPriceSuggestions({
  discogs,
  userId,
  releaseId,
  convert,
}: {
  discogs: PriceSuggestionsClient;
  userId: number;
  releaseId: number;
  convert: (amount: number, fromCurrency: string) => Promise<{ amount: number; currency: string }>;
}): Promise<PriceSuggestionsResponse> {
  const scope = createUserJobScope(userId);
  const key = `${userId}:${releaseId}`;
  let raw = cache.get(key);

  if (!raw || Date.now() - raw.fetchedAt > CACHE_TTL_MS) {
    try {
      const parsed = parsePriceSuggestions(await discogs.getPriceSuggestions(releaseId));
      scope.assertCurrent();
      if (!parsed) {
        return { available: false, reason: 'error', message: null };
      }
      raw = { fetchedAt: Date.now(), value: parsed };
      cache.set(key, raw);
    } catch (error) {
      return isSellerSettingsError(error)
        ? { available: false, reason: 'seller_settings', message: null }
        : { available: false, reason: 'error', message: error instanceof Error ? error.message : null };
    }
  }

  const converted = await Promise.all(raw.value.suggestions.map(async (suggestion) => ({
    condition: suggestion.condition,
    ...(await convert(suggestion.value, raw.value.currency)),
  })));

  scope.assertCurrent();
  return {
    available: true,
    currency: converted[0]?.currency ?? raw.value.currency,
    suggestions: converted.map(({ condition, amount }) => ({ condition, value: amount })),
  };
}
