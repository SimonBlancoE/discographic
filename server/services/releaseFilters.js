import { parseJson } from '../db.js';
import { createCollectionFilters } from '../../shared/collectionFilters.js';

export function buildReleaseFilterWhere({ userId, filters = {}, baseClauses = [] }) {
  const { search, genre, style, decade, format, label } = createCollectionFilters(filters);
  const clauses = ['user_id = ?', ...baseClauses];
  const params = [userId];

  if (search) {
    clauses.push('(artist LIKE ? OR title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (genre) {
    clauses.push('genres LIKE ?');
    params.push(`%${genre}%`);
  }

  if (style) {
    clauses.push('styles LIKE ?');
    params.push(`%${style}%`);
  }

  if (decade) {
    const start = Number(decade);
    if (Number.isFinite(start)) {
      clauses.push('year >= ? AND year < ?');
      params.push(start, start + 10);
    }
  }

  if (format) {
    clauses.push('formats LIKE ?');
    params.push(`%${format}%`);
  }

  if (label) {
    clauses.push('labels LIKE ?');
    params.push(`%${label}%`);
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

export function getCollectionFilterOptions(db, userId) {
  const releases = db.prepare('SELECT genres, styles, formats, labels, year FROM releases WHERE user_id = ?').all(userId);
  const genres = new Set();
  const styles = new Set();
  const formats = new Set();
  const labels = new Set();
  const decades = new Set();

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
  }

  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    styles: [...styles].sort((a, b) => a.localeCompare(b)),
    decades: [...decades].sort((a, b) => a - b),
    formats: [...formats].sort((a, b) => a.localeCompare(b)),
    labels: [...labels].sort((a, b) => a.localeCompare(b)).slice(0, 100)
  };
}
