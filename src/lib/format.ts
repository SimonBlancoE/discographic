import { getCurrentLocale } from '../../shared/i18n.js';

export type NameEntry = string | { name?: string | null } | null | undefined;

export function formatCurrency(value: number | string | null | undefined, currency = 'EUR') {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const locale = getCurrentLocale();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatNumber(value: number | string | null | undefined) {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES').format(Number(value || 0));
}

export function joinNames(list: unknown[] | null | undefined, pick: (item: unknown) => string | null | undefined = (item) => {
  if (typeof item === 'string') {
    return item;
  }

  if (item && typeof item === 'object' && 'name' in item) {
    return typeof item.name === 'string' ? item.name : null;
  }

  return null;
}) {
  if (!Array.isArray(list) || !list.length) {
    return '-';
  }

  return list.map(pick).filter(Boolean).join(', ');
}
