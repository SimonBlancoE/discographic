export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'EUR';

export function normalizeCurrency(value: unknown, fallback: Currency = DEFAULT_CURRENCY): Currency {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(normalized as Currency) ? (normalized as Currency) : fallback;
}
