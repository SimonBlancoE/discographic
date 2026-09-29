// @ts-nocheck
import { createCollectionFilters, UNGRADED_CONDITION } from '../../shared/collectionFilters.js';
import { parseJson } from './jsonStorage.js';

const LIKE_ESCAPE = "ESCAPE '\\'";

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// JSON columns are written with JSON.stringify, so matching the serialized token keeps
// "Rock" from also matching "Folk Rock" or "Rock & Roll".
function jsonStringToken(value) {
  return `%${escapeLike(JSON.stringify(value))}%`;
}

function jsonNameToken(value) {
  return `%${escapeLike(`"name":${JSON.stringify(value)}`)}%`;
}

const NOTES_ARRAY = "CASE WHEN json_valid(notes) THEN notes ELSE '[]' END";

export function buildReleaseFilterWhere({ userId, filters = {}, baseClauses = [], mediaFieldId = 1 }) {
  const { search, genre, style, decade, format, label, folder, condition } = createCollectionFilters(filters);
  const clauses = ['user_id = ?', ...baseClauses];
  const params = [userId];

  if (search) {
    clauses.push(`(artist LIKE ? ${LIKE_ESCAPE} OR title LIKE ? ${LIKE_ESCAPE})`);
    params.push(`%${escapeLike(search)}%`, `%${escapeLike(search)}%`);
  }

  if (genre) {
    clauses.push(`genres LIKE ? ${LIKE_ESCAPE}`);
    params.push(jsonStringToken(genre));
  }

  if (style) {
    clauses.push(`styles LIKE ? ${LIKE_ESCAPE}`);
    params.push(jsonStringToken(style));
  }

  if (decade) {
    const start = Number(decade);
    if (Number.isFinite(start)) {
      clauses.push('year >= ? AND year < ?');
      params.push(start, start + 10);
    }
  }

  if (format) {
    clauses.push(`formats LIKE ? ${LIKE_ESCAPE}`);
    params.push(jsonNameToken(format));
  }

  if (label) {
    clauses.push(`labels LIKE ? ${LIKE_ESCAPE}`);
    params.push(jsonNameToken(label));
  }

  if (folder) {
    const folderId = Number(folder);
    if (Number.isInteger(folderId)) {
      clauses.push('folder_id = ?');
      params.push(folderId);
    }
  }

  if (condition && mediaFieldId) {
    const matchesMediaField = `SELECT 1 FROM json_each(${NOTES_ARRAY}) WHERE CAST(json_extract(value, '$.field_id') AS INTEGER) = ?`;
    if (condition === UNGRADED_CONDITION) {
      clauses.push(`NOT EXISTS (${matchesMediaField} AND COALESCE(json_extract(value, '$.value'), '') != '')`);
      params.push(mediaFieldId);
    } else {
      clauses.push(`EXISTS (${matchesMediaField} AND json_extract(value, '$.value') = ?)`);
      params.push(mediaFieldId, condition);
    }
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

export function getCollectionFilterOptions(db, userId, { folders = [], mediaFieldId = 1 } = {}) {
  const releases = db.prepare('SELECT genres, styles, formats, labels, year, notes FROM releases WHERE user_id = ?').all(userId);
  const genres = new Set();
  const styles = new Set();
  const formats = new Set();
  const labels = new Set();
  const decades = new Set();
  const conditions = new Set();

  for (const release of releases) {
    for (const genre of parseJson(release.genres, [])) {
      if (genre) genres.add(genre);
    }
    for (const style of parseJson(release.styles, [])) {
      if (style) styles.add(style);
    }
    for (const format of parseJson(release.formats, [])) {
      const name = format?.name || format;
      if (name) formats.add(name);
    }
    for (const label of parseJson(release.labels, [])) {
      const name = label?.name || label;
      if (name) labels.add(name);
    }
    if (release.year) {
      decades.add(Math.floor(release.year / 10) * 10);
    }
    for (const note of parseJson(release.notes, [])) {
      if (Number(note?.field_id) === Number(mediaFieldId) && note?.value) {
        conditions.add(String(note.value));
      }
    }
  }

  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    styles: [...styles].sort((a, b) => a.localeCompare(b)),
    decades: [...decades].sort((a, b) => a - b),
    formats: [...formats].sort((a, b) => a.localeCompare(b)),
    labels: [...labels].sort((a, b) => a.localeCompare(b)),
    folders,
    conditions: [...conditions]
  };
}
