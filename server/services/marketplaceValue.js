import { DEFAULT_CURRENCY } from './exchangeRates.js';

export const MARKETPLACE_STATUS = {
  PENDING: 'pending',
  PRICED: 'priced',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed'
};

export const RETRYABLE_MARKETPLACE_STATUSES = [
  MARKETPLACE_STATUS.PENDING,
  MARKETPLACE_STATUS.FAILED
];

export async function fetchMarketplaceValue(discogs, releaseId, currency = DEFAULT_CURRENCY) {
  try {
    const stats = await discogs.getMarketplaceStats(releaseId, currency);
    const rawValue = stats?.lowest_price?.value;
    const estimatedValue = rawValue == null ? null : Number(rawValue);

    if (!Number.isFinite(estimatedValue)) {
      return {
        estimatedValue: null,
        marketplaceStatus: MARKETPLACE_STATUS.UNAVAILABLE,
        error: null
      };
    }

    return {
      estimatedValue,
      marketplaceStatus: MARKETPLACE_STATUS.PRICED,
      error: null
    };
  } catch (error) {
    console.log('[marketplace-value] fetch failed:', releaseId, error.message);
    return {
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      error: error.message
    };
  }
}
