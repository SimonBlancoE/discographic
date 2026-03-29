import { getCurrentLocale } from '../../shared/i18n';

export function formatCurrency(value) {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return '-';
  }

  const locale = getCurrentLocale();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatNumber(value) {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES').format(Number(value || 0));
}

export function joinNames(list, pick = (item) => item?.name || item) {
  if (!Array.isArray(list) || !list.length) {
    return '-';
  }

  return list.map(pick).filter(Boolean).join(', ');
}
