// Canonical contract for a row in the `releases` table. Source of truth for
// the SELECT column list used by the API and for the JSON-string columns that
// hydrateRelease decodes. Both server and client import from here so that
// adding a column is a one-line change.

export const RELEASE_DB_COLUMNS = [
  'id',
  'user_id',
  'release_id',
  'instance_id',
  'title',
  'artist',
  'year',
  'genres',
  'styles',
  'formats',
  'labels',
  'country',
  'cover_url',
  'rating',
  'notes',
  'date_added',
  'estimated_value',
  'listing_status',
  'listing_price',
  'listing_currency',
  'listing_price_eur',
  'tracklist',
  'folder_id',
  'raw_json',
  'synced_at'
];

export const RELEASE_BASE_FIELDS = RELEASE_DB_COLUMNS.join(', ');

export const RELEASE_JSON_FIELDS = ['genres', 'styles', 'formats', 'labels', 'notes', 'tracklist'];

export const COVER_VARIANTS = ['detail', 'wall', 'tapete', 'poster'];

/**
 * @typedef {Object} Release
 * @property {number} id
 * @property {number} user_id
 * @property {number} release_id
 * @property {number} instance_id
 * @property {string} title
 * @property {string} artist
 * @property {number|null} year
 * @property {Array<string>} genres
 * @property {Array<string>} styles
 * @property {Array<{name: string}|string>} formats
 * @property {Array<{name: string}|string>} labels
 * @property {string|null} country
 * @property {string|null} cover_url
 * @property {number} rating
 * @property {Array<{field_id: number, value: string}>} notes
 * @property {string|null} date_added
 * @property {number|null} estimated_value
 * @property {string|null} listing_status
 * @property {number|null} listing_price
 * @property {string|null} listing_currency
 * @property {number|null} listing_price_eur
 * @property {Array<{position: string, title: string}>} tracklist
 * @property {number} folder_id
 * @property {object|null} raw_json
 * @property {string} synced_at
 * @property {string} [notes_text]
 * @property {string} [detail_cover_url]
 * @property {string} [wall_cover_url]
 * @property {string} [poster_cover_url]
 */
