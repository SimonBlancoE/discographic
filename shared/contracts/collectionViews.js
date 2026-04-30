import { createCollectionFilters } from '../collectionFilters.js';

export const COLLECTION_SAVED_VIEWS_KEY = 'collection_saved_views';
export const MAX_COLLECTION_SAVED_VIEWS = 12;

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSortOrder(value) {
  return String(value || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function normalizeVisibleColumns(columns) {
  return [...new Set(asArray(columns).map(asText).filter(Boolean))];
}

export function normalizeCollectionSavedView(view) {
  if (!view || typeof view !== 'object') {
    return null;
  }

  const id = asText(view.id);
  const name = asText(view.name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    filters: createCollectionFilters(view.filters || {}),
    sortBy: asText(view.sortBy) || 'artist',
    sortOrder: normalizeSortOrder(view.sortOrder),
    visibleColumns: normalizeVisibleColumns(view.visibleColumns)
  };
}

export function normalizeCollectionSavedViews(value) {
  return asArray(value)
    .map(normalizeCollectionSavedView)
    .filter(Boolean)
    .slice(0, MAX_COLLECTION_SAVED_VIEWS);
}
