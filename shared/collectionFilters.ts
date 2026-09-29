export const COLLECTION_FILTER_KEYS = Object.freeze([
  'search',
  'genre',
  'style',
  'decade',
  'format',
  'label',
  'folder',
  'condition'
]) as readonly [
  'search',
  'genre',
  'style',
  'decade',
  'format',
  'label',
  'folder',
  'condition',
];

/** Condition filter value that selects releases whose media condition has not been graded. */
export const UNGRADED_CONDITION = '__ungraded__';

export type CollectionFilterKey = (typeof COLLECTION_FILTER_KEYS)[number];
export type CollectionFilters = Record<CollectionFilterKey, string>;
export type ActiveCollectionFilters = Partial<CollectionFilters>;
type FilterLookup = { get: (key: string) => unknown };
type FilterRecord = Partial<Record<CollectionFilterKey, unknown>>;
type CollectionFilterSource = FilterLookup | FilterRecord | null | undefined;

function hasFilterLookup(source: CollectionFilterSource): source is FilterLookup {
  return Boolean(source) && typeof (source as FilterLookup).get === 'function';
}

function readFilterValue(source: CollectionFilterSource, key: CollectionFilterKey): string {
  if (!source) {
    return '';
  }

  if (hasFilterLookup(source)) {
    return String(source.get(key) ?? '').trim();
  }

  return source[key] == null ? '' : String(source[key]).trim();
}

export function createCollectionFilters(source: CollectionFilterSource = null): CollectionFilters {
  const filters = {} as CollectionFilters;

  for (const key of COLLECTION_FILTER_KEYS) {
    filters[key] = readFilterValue(source, key);
  }

  return filters;
}

export function getActiveCollectionFilters(source: CollectionFilterSource = null): ActiveCollectionFilters {
  const filters = createCollectionFilters(source);
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as ActiveCollectionFilters;
}
