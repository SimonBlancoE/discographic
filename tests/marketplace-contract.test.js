import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_STATUS,
  RETRYABLE_MARKETPLACE_STATUSES,
  getMarketplaceStatusLabelKey,
  hasPricedMarketplaceValue
} from '../shared/contracts/marketplace.js';

describe('marketplace contract', () => {
  it('defines shared marketplace statuses used by server and client code', () => {
    expect(MARKETPLACE_STATUS).toEqual({
      PENDING: 'pending',
      PRICED: 'priced',
      UNAVAILABLE: 'unavailable',
      FAILED: 'failed'
    });
    expect(RETRYABLE_MARKETPLACE_STATUSES).toEqual([
      MARKETPLACE_STATUS.PENDING,
      MARKETPLACE_STATUS.FAILED
    ]);
  });

  it('maps marketplace statuses to collection price label keys', () => {
    expect(getMarketplaceStatusLabelKey(MARKETPLACE_STATUS.PENDING)).toBe('collection.pricePending');
    expect(getMarketplaceStatusLabelKey(MARKETPLACE_STATUS.FAILED)).toBe('collection.priceFailed');
    expect(getMarketplaceStatusLabelKey(MARKETPLACE_STATUS.UNAVAILABLE)).toBe('collection.priceUnavailable');
    expect(getMarketplaceStatusLabelKey('not-a-status')).toBe('collection.priceUnknown');
  });

  it('identifies records with a confirmed positive marketplace value', () => {
    expect(hasPricedMarketplaceValue({ marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_value: 12.5 })).toBe(true);
    expect(hasPricedMarketplaceValue({ marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_value: 0 })).toBe(false);
    expect(hasPricedMarketplaceValue({ marketplace_status: MARKETPLACE_STATUS.FAILED, estimated_value: 12.5 })).toBe(false);
    expect(hasPricedMarketplaceValue({ marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_value: null })).toBe(false);
  });
});
