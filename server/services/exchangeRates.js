import { EcbClient } from 'ecb-exchange-rates-ts';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, normalizeCurrency } from '../../shared/currency.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const ecb = new EcbClient();
let cachedSnapshot = null;
let pendingFetch = null;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function latestRate(result) {
  if (!result?.rates?.size) {
    return null;
  }

  return [...result.rates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .at(-1)?.[1] ?? null;
}

// Bypasses the SUPPORTED_CURRENCIES allowlist so Discogs-supplied currency
// codes (any 3-letter ISO) round-trip through the ECB lookup intact.
function normalizeAnyCurrency(value, fallback = DEFAULT_CURRENCY) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
}

export async function getExchangeSnapshot(extraCurrencies = []) {
  const requiredCurrencies = [...new Set([
    ...SUPPORTED_CURRENCIES,
    ...extraCurrencies
      .map((currency) => normalizeAnyCurrency(currency))
      .filter((c) => /^[A-Z]{3}$/.test(c))
  ])]
    .filter((currency) => currency !== DEFAULT_CURRENCY);

  if (
    cachedSnapshot &&
    Date.now() - cachedSnapshot.fetchedAt < CACHE_TTL_MS &&
    requiredCurrencies.every((currency) => cachedSnapshot.rates[currency])
  ) {
    return cachedSnapshot;
  }

  if (pendingFetch) {
    return pendingFetch;
  }

  pendingFetch = (async () => {
    try {
      const results = await Promise.all(requiredCurrencies.map(async (currency) => {
        const today = todayIsoDate();
        const rate = latestRate(await ecb.getRate(currency, today).catch(() => null))
          ?? latestRate(await ecb.getRate(currency, yesterdayIsoDate()).catch(() => null));
        return [currency, rate];
      }));

      const rates = { EUR: 1 };
      for (const [currency, rate] of results) {
        rates[currency] = rate;
      }

      const snapshot = {
        fetchedAt: Date.now(),
        date: todayIsoDate(),
        rates
      };

      if (!requiredCurrencies.every((currency) => snapshot.rates[currency])) {
        throw new Error('Incomplete ECB rates snapshot');
      }

      cachedSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }

      throw error;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

export function convertAmountWithRates(amount, fromCurrency, toCurrency, rates) {
  if (amount === null || amount === undefined || amount === '') {
    return null;
  }

  const source = normalizeAnyCurrency(fromCurrency);
  const target = normalizeAnyCurrency(toCurrency);
  const numeric = Number(amount);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (source === target) {
    return numeric;
  }

  const sourceRate = rates[source];
  const targetRate = rates[target];
  if (!sourceRate || !targetRate) {
    throw new Error(`Missing exchange rate for ${source} -> ${target}`);
  }

  const amountInEur = source === DEFAULT_CURRENCY ? numeric : numeric / sourceRate;
  const converted = target === DEFAULT_CURRENCY ? amountInEur : amountInEur * targetRate;

  return Number(converted.toFixed(2));
}

export async function convertAmount(amount, fromCurrency, toCurrency) {
  const snapshot = await getExchangeSnapshot();
  return convertAmountWithRates(amount, fromCurrency, toCurrency, snapshot.rates);
}

export async function convertReleasePrices(release, displayCurrency) {
  const targetCurrency = normalizeCurrency(displayCurrency);
  const snapshot = await getExchangeSnapshot();

  return {
    ...release,
    estimated_value: convertAmountWithRates(release.estimated_value, DEFAULT_CURRENCY, targetCurrency, snapshot.rates),
    listing_price: release.listing_price_eur == null
      ? null
      : convertAmountWithRates(release.listing_price_eur, DEFAULT_CURRENCY, targetCurrency, snapshot.rates),
    display_currency: targetCurrency
  };
}

export { DEFAULT_CURRENCY, normalizeCurrency };
