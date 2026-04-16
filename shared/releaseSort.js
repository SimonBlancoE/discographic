// Columns the server allows in `ORDER BY` for the /api/collection list.
// The client UI maps its visible column registry onto these keys; both must
// agree, so they share this single allowlist.

export const SORTABLE_COLUMNS = [
  'artist',
  'title',
  'year',
  'rating',
  'date_added',
  'estimated_value',
  'listing_price_eur'
];

export const SORTABLE_COLUMN_SET = new Set(SORTABLE_COLUMNS);

export function isValidSortColumn(value) {
  return SORTABLE_COLUMN_SET.has(value);
}
