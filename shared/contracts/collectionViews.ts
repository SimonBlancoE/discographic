import { createCollectionFilters } from '../collectionFilters.js';

export const COLLECTION_SAVED_VIEWS_KEY = 'collection_saved_views';
export const MAX_COLLECTION_SAVED_VIEWS = 12;
export type CollectionSortOrder = 'asc' | 'desc';
export type CollectionSavedView = {
  id: string;
  name: string;
  filters: ReturnType<typeof createCollectionFilters>;
  sortBy: string;
  sortOrder: CollectionSortOrder;
  visibleColumns: string[];
};

type SavedViewInput = {
  id?: unknown;
  name?: unknown;
  filters?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
  visibleColumns?: unknown;
} | null | undefined;

function asArray(value: unknown): unknown[] {
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

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSortOrder(value: unknown): CollectionSortOrder {
  return String(value || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function normalizeVisibleColumns(columns: unknown): string[] {
  return [...new Set(asArray(columns).map(asText).filter(Boolean))];
}

export function normalizeCollectionSavedView(view: SavedViewInput): CollectionSavedView | null {
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

export function normalizeCollectionSavedViews(value: unknown): CollectionSavedView[] {
  return asArray(value)
    .map((view) => normalizeCollectionSavedView(view as SavedViewInput))
    .filter((view): view is CollectionSavedView => Boolean(view))
    .slice(0, MAX_COLLECTION_SAVED_VIEWS);
}
