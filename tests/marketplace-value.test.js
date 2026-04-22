import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchMarketplaceValue, MARKETPLACE_STATUS } from '../server/services/marketplaceValue.js';

describe('fetchMarketplaceValue', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns READY with parsed price when marketplace returns valid lowest_price', async () => {
    const discogs = { getMarketplaceStats: async () => ({ lowest_price: { value: 42.5 } }) };
    const result = await fetchMarketplaceValue(discogs, 123);
    expect(result.estimatedValue).toBe(42.5);
    expect(result.marketplaceStatus).toBe(MARKETPLACE_STATUS.READY);
  });

  it('returns UNAVAILABLE when lowest_price is null', async () => {
    const discogs = { getMarketplaceStats: async () => ({ lowest_price: { value: null } }) };
    const result = await fetchMarketplaceValue(discogs, 123);
    expect(result.estimatedValue).toBeNull();
    expect(result.marketplaceStatus).toBe(MARKETPLACE_STATUS.UNAVAILABLE);
  });

  it('returns FAILED and logs error.message when discogs throws', async () => {
    const discogs = {
      getMarketplaceStats: async () => {
        throw new Error('network blew up');
      }
    };
    const result = await fetchMarketplaceValue(discogs, 456);
    expect(result.marketplaceStatus).toBe(MARKETPLACE_STATUS.FAILED);
    expect(result.estimatedValue).toBeNull();
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('network blew up');
    expect(logged).toContain('456');
  });
});
