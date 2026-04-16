// Filter contract used by the collection list, the export, the cover wall and
// the tapete poster. Server uses these keys to build the SQL WHERE; client
// uses them to build form state and URL params. Adding a filter is a single
// addition here.

export const COLLECTION_FILTER_KEYS = ['search', 'genre', 'style', 'decade', 'format', 'label'];

export const DEFAULT_FILTERS = Object.freeze(
  Object.fromEntries(COLLECTION_FILTER_KEYS.map((key) => [key, '']))
);

export function pickFilters(source) {
  return Object.fromEntries(
    COLLECTION_FILTER_KEYS.map((key) => [key, source?.[key] ?? ''])
  );
}
