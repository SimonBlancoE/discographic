import { EcbClient, type ExchangeRateResult } from 'ecb-exchange-rates-ts';
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  normalizeCurrency,
  type Currency
} from '../../shared/currency.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Snapshots built from fallback rates are retried soon instead of being trusted for hours.
const DEGRADED_CACHE_TTL_MS = 5 * 60 * 1000;
// Approximate rates for the supported display currencies, used only when the ECB is unreachable
// so the UI keeps rendering. Other currencies are left missing rather than guessed.
const DISPLAY_FALLBACK_RATES: RateMap = { USD: 1.1, GBP: 0.85 };

type RateMap = Record<string, number | null | undefined>;
type ExchangeSnapshot = {
  fetchedAt: number;
  date: string;
  rates: RateMap;
  degraded?: boolean;
};
type ReleasePriceFields = {
  estimated_value?: unknown;
  listing_price_eur?: unknown;
};

const ecb = new EcbClient();
let cachedSnapshot: ExchangeSnapshot | null = null;
let pendingFetch: Promise<ExchangeSnapshot> | null = null;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function latestRate(result: ExchangeRateResult | null): number | null {
  if (!result?.rates?.size) {
    return null;
  }

  return [...result.rates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .at(-1)?.[1] ?? null;
}

function normalizeRateCurrency(value: unknown, fallback: string = DEFAULT_CURRENCY): string {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
}

function getRequiredCurrencies(extraCurrencies: unknown[]): string[] {
  return [...new Set([
    ...SUPPORTED_CURRENCIES,
    ...extraCurrencies
      .map((currency) => normalizeRateCurrency(currency))
      .filter((c) => /^[A-Z]{3}$/.test(c))
  ])]
    .filter((currency) => currency !== DEFAULT_CURRENCY);
}

export async function getExchangeSnapshot(extraCurrencies: unknown[] = []): Promise<ExchangeSnapshot> {
  const requiredCurrencies = getRequiredCurrencies(extraCurrencies);
  const snapshot = cachedSnapshot;
  const hasRequiredRates = (candidate: ExchangeSnapshot) => requiredCurrencies.every((currency) => candidate.rates[currency]);

  if (
    snapshot &&
    Date.now() - snapshot.fetchedAt < (snapshot.degraded ? DEGRADED_CACHE_TTL_MS : CACHE_TTL_MS) &&
    hasRequiredRates(snapshot)
  ) {
    return snapshot;
  }

  if (pendingFetch) {
    // A fetch already in flight may have been started for a different currency set.
    const inFlight = await pendingFetch;
    if (hasRequiredRates(inFlight)) {
      return inFlight;
    }
  }

  pendingFetch = (async () => {
    try {
      const results = await Promise.all(requiredCurrencies.map(async (currency): Promise<[string, number | null]> => {
        const today = todayIsoDate();
        const rate = latestRate(await ecb.getRate(currency, today).catch(() => null))
          ?? latestRate(await ecb.getRate(currency, yesterdayIsoDate()).catch(() => null));
        return [currency, rate];
      }));

      const rates: RateMap = { EUR: 1 };
      for (const [currency, rate] of results) {
        rates[currency] = rate;
      }

      const snapshot: ExchangeSnapshot = {
        fetchedAt: Date.now(),
        date: todayIsoDate(),
        rates
      };

      if (!requiredCurrencies.every((currency) => snapshot.rates[currency])) {
        console.warn('Incomplete ECB rates snapshot. Using display fallbacks where available.');
        snapshot.degraded = true;
        for (const currency of requiredCurrencies) {
          if (!snapshot.rates[currency]) {
            snapshot.rates[currency] = DISPLAY_FALLBACK_RATES[currency] ?? null;
          }
        }
      }

      cachedSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (cachedSnapshot) {
        return cachedSnapshot;
      }

      console.warn('Failed to fetch ECB rates and no cache exists. Using defaults.', error);
      const rates: RateMap = { EUR: 1, ...DISPLAY_FALLBACK_RATES };
      const fallbackSnapshot = {
        fetchedAt: Date.now(),
        date: todayIsoDate(),
        rates,
        degraded: true
      };
      cachedSnapshot = fallbackSnapshot;
      return fallbackSnapshot;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

export function convertAmountWithRates(
  amount: unknown,
  fromCurrency: unknown,
  toCurrency: unknown,
  rates: RateMap,
): number | null {
  if (amount === null || amount === undefined || amount === '') {
    return null;
  }

  const source = normalizeRateCurrency(fromCurrency);
  const target = normalizeRateCurrency(toCurrency);
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

export async function convertAmount(amount: unknown, fromCurrency: unknown, toCurrency: unknown): Promise<number | null> {
  const snapshot = await getExchangeSnapshot();
  return convertAmountWithRates(amount, fromCurrency, toCurrency, snapshot.rates);
}

export async function convertReleasePrices<Release extends ReleasePriceFields>(
  release: Release,
  displayCurrency: unknown,
): Promise<Release & {
  estimated_value: number | null;
  listing_price: number | null;
  display_currency: Currency;
}> {
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
