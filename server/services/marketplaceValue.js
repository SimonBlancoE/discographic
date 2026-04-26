import { MARKETPLACE_STATUS } from '../../shared/contracts/marketplace.js';
import { DEFAULT_CURRENCY } from './exchangeRates.js';

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error == null) {
    return 'Unknown marketplace error';
  }

  return String(error);
}

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
    const message = getErrorMessage(error);
    console.log('[marketplace-value] fetch failed:', releaseId, message);
    return {
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      error: message
    };
  }
}
