export const MARKETPLACE_STATUS = Object.freeze({
  PENDING: 'pending',
  PRICED: 'priced',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed'
} as const);
export type MarketplaceStatus = (typeof MARKETPLACE_STATUS)[keyof typeof MARKETPLACE_STATUS];

export const RETRYABLE_MARKETPLACE_STATUSES = Object.freeze([
  MARKETPLACE_STATUS.PENDING,
  MARKETPLACE_STATUS.FAILED
]) as readonly MarketplaceStatus[];

const MARKETPLACE_STATUS_LABEL_KEYS = Object.freeze({
  [MARKETPLACE_STATUS.PENDING]: 'collection.pricePending',
  [MARKETPLACE_STATUS.FAILED]: 'collection.priceFailed',
  [MARKETPLACE_STATUS.UNAVAILABLE]: 'collection.priceUnavailable'
} as const);

type MarketplaceRelease = {
  estimated_value?: unknown;
  marketplace_status?: unknown;
} | null | undefined;

export function getMarketplaceStatusLabelKey(status: unknown): string {
  return MARKETPLACE_STATUS_LABEL_KEYS[status as keyof typeof MARKETPLACE_STATUS_LABEL_KEYS] || 'collection.priceUnknown';
}

export function hasPricedMarketplaceValue(release: MarketplaceRelease): boolean {
  const value = Number(release?.estimated_value);
  return release?.marketplace_status === MARKETPLACE_STATUS.PRICED && Number.isFinite(value) && value > 0;
}
