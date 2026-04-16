// Discogs metadata entries (genres, styles, formats, labels) sometimes arrive
// as `{ name: '...' }` objects (release detail) and sometimes as bare strings
// (collection summary). pickName tolerates both.

export function pickName(entry) {
  return entry?.name || entry;
}
