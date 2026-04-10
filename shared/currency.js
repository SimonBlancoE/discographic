export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP'];
export const DEFAULT_CURRENCY = 'EUR';

export function normalizeCurrency(value, fallback = DEFAULT_CURRENCY) {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(normalized) ? normalized : fallback;
}
