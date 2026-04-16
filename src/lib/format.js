import { getCurrentLocale } from '../../shared/i18n';
import { pickName } from '../../shared/discogs';

function intlLocale() {
  return getCurrentLocale() === 'en' ? 'en-GB' : 'es-ES';
}

export function formatCurrency(value, currency = 'EUR') {
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(intlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat(intlLocale()).format(Number(value || 0));
}

export function joinNames(list, pick = pickName) {
  if (!Array.isArray(list) || !list.length) {
    return '-';
  }

  return list.map(pick).filter(Boolean).join(', ');
}
