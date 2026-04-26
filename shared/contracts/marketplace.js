export const MARKETPLACE_STATUS = Object.freeze({
  PENDING: 'pending',
  PRICED: 'priced',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed'
});

export const RETRYABLE_MARKETPLACE_STATUSES = Object.freeze([
  MARKETPLACE_STATUS.PENDING,
  MARKETPLACE_STATUS.FAILED
]);

const MARKETPLACE_STATUS_LABEL_KEYS = Object.freeze({
  [MARKETPLACE_STATUS.PENDING]: 'collection.pricePending',
  [MARKETPLACE_STATUS.FAILED]: 'collection.priceFailed',
  [MARKETPLACE_STATUS.UNAVAILABLE]: 'collection.priceUnavailable'
});

export function getMarketplaceStatusLabelKey(status) {
  return MARKETPLACE_STATUS_LABEL_KEYS[status] || 'collection.priceUnknown';
}

export function hasPricedMarketplaceValue(release) {
  const value = Number(release?.estimated_value);
  return release?.marketplace_status === MARKETPLACE_STATUS.PRICED && Number.isFinite(value) && value > 0;
}
