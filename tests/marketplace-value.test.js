import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MARKETPLACE_STATUS } from '../shared/contracts/marketplace.js';
import { fetchMarketplaceValue } from '../server/services/marketplaceValue.js';

describe('fetchMarketplaceValue', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns PRICED with parsed price when marketplace returns valid lowest_price', async () => {
    const discogs = { getMarketplaceStats: async () => ({ lowest_price: { value: 42.5 } }) };
    const result = await fetchMarketplaceValue(discogs, 123);

    expect(result).toEqual({
      estimatedValue: 42.5,
      marketplaceStatus: MARKETPLACE_STATUS.PRICED,
      error: null
    });
  });

  it('returns UNAVAILABLE when marketplace stats contain no price', async () => {
    const discogs = { getMarketplaceStats: async () => ({ lowest_price: { value: null } }) };
    const result = await fetchMarketplaceValue(discogs, 123);

    expect(result).toEqual({
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.UNAVAILABLE,
      error: null
    });
  });

  it('returns FAILED and an error message when discogs throws', async () => {
    const discogs = {
      getMarketplaceStats: async () => {
        throw new Error('network blew up');
      }
    };
    const result = await fetchMarketplaceValue(discogs, 456);

    expect(result).toEqual({
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      error: 'network blew up'
    });
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('network blew up');
    expect(logged).toContain('456');
  });

  it('returns FAILED with a normalized message when discogs throws a non-Error value', async () => {
    const discogs = {
      getMarketplaceStats: async () => {
        throw 'rate limited';
      }
    };
    const result = await fetchMarketplaceValue(discogs, 654);

    expect(result).toEqual({
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      error: 'rate limited'
    });
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('rate limited');
    expect(logged).toContain('654');
  });

  it('returns UNAVAILABLE when marketplace stats are malformed', async () => {
    const discogs = { getMarketplaceStats: async () => ({ lowest_price: { value: 'not-a-price' } }) };
    const result = await fetchMarketplaceValue(discogs, 789);

    expect(result).toEqual({
      estimatedValue: null,
      marketplaceStatus: MARKETPLACE_STATUS.UNAVAILABLE,
      error: null
    });
  });
});
