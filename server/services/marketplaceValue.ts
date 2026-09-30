import type { DiscogsRequestOptions } from '../discogs.js';
import { MARKETPLACE_STATUS, type MarketplaceStatus } from '../../shared/contracts/marketplace.js';
import { DEFAULT_CURRENCY } from './exchangeRates.js';

type MarketplaceClient = {
  getMarketplaceStats: (releaseId: number, currency: string, options?: DiscogsRequestOptions) => Promise<unknown>;
};

type MarketplaceValueResult = {
  estimatedValue: number | null;
  marketplaceStatus: MarketplaceStatus;
  error: string | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error == null) {
    return 'Unknown marketplace error';
  }

  return String(error);
}

export async function fetchMarketplaceValue(
  discogs: MarketplaceClient,
  releaseId: number,
  currency = DEFAULT_CURRENCY,
  options?: DiscogsRequestOptions,
): Promise<MarketplaceValueResult> {
  try {
    const stats = await discogs.getMarketplaceStats(releaseId, currency, options);
    const lowestPrice = stats && typeof stats === 'object' && 'lowest_price' in stats ? stats.lowest_price : null;
    const rawValue = lowestPrice && typeof lowestPrice === 'object' && 'value' in lowestPrice ? lowestPrice.value : null;
    const estimatedValue = rawValue == null ? null : Number(rawValue);

    if (estimatedValue === null || !Number.isFinite(estimatedValue)) {
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
    const message = getErrorMessage(error);
    console.log('[marketplace-value] fetch failed:', releaseId, message);
    return {
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      error: message
    };
  }
}
