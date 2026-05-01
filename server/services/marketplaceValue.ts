import { MARKETPLACE_STATUS, type MarketplaceStatus } from '../../shared/contracts/marketplace.js';
import { DEFAULT_CURRENCY } from './exchangeRates.js';

type MarketplaceStatsResponse = {
  lowest_price?: {
    value?: unknown;
  } | null;
} | null | undefined;

type MarketplaceClient = {
  getMarketplaceStats: (releaseId: number, currency: string) => Promise<MarketplaceStatsResponse>;
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
): Promise<MarketplaceValueResult> {
  try {
    const stats = await discogs.getMarketplaceStats(releaseId, currency);
    const rawValue = stats?.lowest_price?.value;
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
