export const COLLECTION_FILTER_KEYS = Object.freeze([
  'search',
  'genre',
  'style',
  'decade',
  'format',
  'label'
]);


function readFilterValue(source, key) {
  if (!source) {
    return '';
  }

  if (typeof source.get === 'function') {
    return source.get(key) || '';
  }

  return source[key] == null ? '' : String(source[key]).trim();
}

export function createCollectionFilters(source = null) {
  const filters = {};

  for (const key of COLLECTION_FILTER_KEYS) {
    filters[key] = readFilterValue(source, key);
  }

  return filters;
}

export function getActiveCollectionFilters(source = null) {
  const filters = createCollectionFilters(source);
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}
