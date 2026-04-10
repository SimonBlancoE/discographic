import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY, convertAmountWithRates, normalizeCurrency } from '../server/services/exchangeRates.js';

const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };

describe('exchange rate helpers', () => {
  it('normalizes unsupported currencies back to EUR', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('cad')).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency(null)).toBe(DEFAULT_CURRENCY);
  });

  it('converts EUR into USD', () => {
    expect(convertAmountWithRates(10, 'EUR', 'USD', rates)).toBeCloseTo(11);
  });

  it('converts USD into EUR', () => {
    expect(convertAmountWithRates(11, 'USD', 'EUR', rates)).toBeCloseTo(10);
  });

  it('converts GBP into USD via EUR cross-rate', () => {
    expect(convertAmountWithRates(8.5, 'GBP', 'USD', rates)).toBeCloseTo(11);
  });

  it('returns null for empty amounts', () => {
    expect(convertAmountWithRates(null, 'EUR', 'USD', rates)).toBeNull();
  });

  it('returns null for undefined amounts', () => {
    expect(convertAmountWithRates(undefined, 'EUR', 'USD', rates)).toBeNull();
  });

  it('returns null for empty string amounts', () => {
    expect(convertAmountWithRates('', 'EUR', 'USD', rates)).toBeNull();
  });

  it('returns null for non-finite amounts', () => {
    expect(convertAmountWithRates('abc', 'EUR', 'USD', rates)).toBeNull();
    expect(convertAmountWithRates(NaN, 'EUR', 'USD', rates)).toBeNull();
    expect(convertAmountWithRates(Infinity, 'EUR', 'USD', rates)).toBeNull();
  });

  it('returns same value when source equals target', () => {
    expect(convertAmountWithRates(42, 'USD', 'USD', rates)).toBe(42);
    expect(convertAmountWithRates(10, 'EUR', 'EUR', rates)).toBe(10);
  });

  it('throws when a required rate is missing', () => {
    expect(() => convertAmountWithRates(10, 'EUR', 'JPY', rates)).toThrow('Missing exchange rate');
    expect(() => convertAmountWithRates(10, 'JPY', 'EUR', rates)).toThrow('Missing exchange rate');
  });

  it('rounds to two decimal places', () => {
    // 10 GBP -> EUR: 10 / 0.85 = 11.764705...
    const result = convertAmountWithRates(10, 'GBP', 'EUR', rates);
    expect(result).toBe(11.76);
  });
});

describe('convertReleasePrices', () => {
  // We test the pure conversion logic without hitting ECB by importing convertAmountWithRates
  // and replicating convertReleasePrices logic inline (since the real function is async and calls ECB)

  function convertReleasePricesSync(release, targetCurrency, ratesMap) {
    return {
      ...release,
      estimated_value: convertAmountWithRates(release.estimated_value, DEFAULT_CURRENCY, targetCurrency, ratesMap),
      listing_price: release.listing_price_eur == null
        ? null
        : convertAmountWithRates(release.listing_price_eur, DEFAULT_CURRENCY, targetCurrency, ratesMap),
      display_currency: targetCurrency
    };
  }

  it('converts estimated_value and listing_price to target currency', () => {
    const release = { estimated_value: 10, listing_price_eur: 20, title: 'Test' };
    const result = convertReleasePricesSync(release, 'USD', rates);
    expect(result.estimated_value).toBeCloseTo(11);
    expect(result.listing_price).toBeCloseTo(22);
    expect(result.display_currency).toBe('USD');
    expect(result.title).toBe('Test');
  });

  it('returns null listing_price when listing_price_eur is null', () => {
    const release = { estimated_value: 10, listing_price_eur: null };
    const result = convertReleasePricesSync(release, 'USD', rates);
    expect(result.estimated_value).toBeCloseTo(11);
    expect(result.listing_price).toBeNull();
  });

  it('returns null estimated_value when it is null', () => {
    const release = { estimated_value: null, listing_price_eur: 5 };
    const result = convertReleasePricesSync(release, 'GBP', rates);
    expect(result.estimated_value).toBeNull();
    expect(result.listing_price).toBeCloseTo(4.25);
  });

  it('preserves values when target is EUR', () => {
    const release = { estimated_value: 10, listing_price_eur: 20 };
    const result = convertReleasePricesSync(release, 'EUR', rates);
    expect(result.estimated_value).toBe(10);
    expect(result.listing_price).toBe(20);
  });
});
