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

// SQLite CURRENT_TIMESTAMP values ("2026-09-26 10:00:00") are UTC but carry no zone marker,
// and `new Date()` would read them as local time.
const SQLITE_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = SQLITE_UTC_TIMESTAMP.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined) {
  const date = parseTimestamp(value);
  if (!date) {
    return '-';
  }

  const locale = getCurrentLocale();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function formatCompactNumber(value: number | null | undefined) {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
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
