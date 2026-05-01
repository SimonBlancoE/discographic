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
};

function asSavedViewInput(value: unknown): SavedViewInput | null {
  return value && typeof value === 'object' ? (value as SavedViewInput) : null;
}

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

export function normalizeCollectionSavedView(view: unknown): CollectionSavedView | null {
  const source = asSavedViewInput(view);
  if (!source) {
    return null;
  }

  const id = asText(source.id);
  const name = asText(source.name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    filters: createCollectionFilters(source.filters || {}),
    sortBy: asText(source.sortBy) || 'artist',
    sortOrder: normalizeSortOrder(source.sortOrder),
    visibleColumns: normalizeVisibleColumns(source.visibleColumns)
  };
}

export function normalizeCollectionSavedViews(value: unknown): CollectionSavedView[] {
  return asArray(value)
    .map(normalizeCollectionSavedView)
    .filter((view): view is CollectionSavedView => Boolean(view))
    .slice(0, MAX_COLLECTION_SAVED_VIEWS);
}
