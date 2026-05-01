export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'EUR';

function isCurrency(value: string): value is Currency {
  return SUPPORTED_CURRENCIES.includes(value as Currency);
}

export function normalizeCurrency(value: unknown, fallback: Currency = DEFAULT_CURRENCY): Currency {
  const normalized = String(value || '').trim().toUpperCase();
  return isCurrency(normalized) ? normalized : fallback;
}
