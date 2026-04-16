import { LISTING_STATUS } from '../../shared/progress.js';
import { DEFAULT_CURRENCY, normalizeCurrency } from '../../shared/currency.js';
import { convertAmountWithRates } from '../services/exchangeRates.js';

const STATUS_RANK = (status) => (status === LISTING_STATUS.FOR_SALE ? 0 : 1);

export function listingToEntry(listing, rates) {
  const originalCurrency = (listing.price?.currency || DEFAULT_CURRENCY).toUpperCase();
  const originalPrice = listing.price?.value != null ? Number(listing.price.value) : null;
  const priceEur = originalPrice == null
    ? null
    : convertAmountWithRates(originalPrice, originalCurrency, DEFAULT_CURRENCY, rates);

  return {
    status: listing.status || LISTING_STATUS.FOR_SALE,
    price: originalPrice,
    currency: originalPrice == null ? null : originalCurrency,
    priceEur
  };
}

// Build a map of release_id -> the most user-relevant listing.
// Tie-breaks: For Sale beats Draft; among the same status, lower priceEur wins.
export function selectBestListings(listings, rates) {
  const map = new Map();

  for (const listing of listings) {
    const releaseId = listing.release?.id;
    if (!releaseId) continue;

    const entry = listingToEntry(listing, rates);
    const existing = map.get(releaseId);

    if (!existing) {
      map.set(releaseId, entry);
      continue;
    }

    const sameStatus = entry.status === existing.status;
    const betterStatus = STATUS_RANK(entry.status) < STATUS_RANK(existing.status);
    const betterPrice = entry.priceEur != null
      && (existing.priceEur == null || entry.priceEur < existing.priceEur);

    if (betterStatus || (sameStatus && betterPrice)) {
      map.set(releaseId, entry);
    }
  }

  return map;
}
