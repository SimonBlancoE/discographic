import type Database from 'better-sqlite3';
import { createCollectionFilters, UNGRADED_CONDITION } from '../../shared/collectionFilters.js';
import type { CollectionFilterKey } from '../../shared/collectionFilters.js';
import type { CollectionFolder } from '../../shared/contracts/collectionFields.js';
import { parseJson } from './jsonStorage.js';
import { getCollectionFacetRevision } from './collectionFacetRevision.js';

const LIKE_ESCAPE = "ESCAPE '\\'";

function escapeLike(value: unknown): string {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// JSON columns are written with JSON.stringify, so matching the serialized token keeps
// "Rock" from also matching "Folk Rock" or "Rock & Roll".
function jsonStringToken(value: string): string {
  return `%${escapeLike(JSON.stringify(value))}%`;
}

function jsonNameToken(value: string): string {
  return `%${escapeLike(`"name":${JSON.stringify(value)}`)}%`;
}

const NOTES_ARRAY = "CASE WHEN json_valid(notes) THEN notes ELSE '[]' END";

export function buildReleaseFilterWhere({ userId, filters = {}, baseClauses = [], mediaFieldId = 1 }: {
  userId: number;
  filters?: Partial<Record<CollectionFilterKey, unknown>>;
  baseClauses?: string[];
  mediaFieldId?: number | null;
}): { clause: string; params: Array<string | number> } {
  const { search, genre, style, decade, format, label, folder, condition } = createCollectionFilters(filters);
  const clauses = ['user_id = ?', ...baseClauses];
  const params: Array<string | number> = [userId];

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

type CollectionFacets = {
  genres: string[];
  styles: string[];
  formats: string[];
  labels: string[];
  decades: number[];
  conditions: string[];
};

type FacetRow = {
  genres: unknown;
  styles: unknown;
  formats: unknown;
  labels: unknown;
  year: number | null;
  notes: unknown;
};

type FacetCacheEntry = { revision: number; expiresAt: number; facets: CollectionFacets };

// SQLite's release triggers invalidate across all writer connections without
// invalidating on session touches or settings writes. Weak keys avoid retaining
// closed databases; each live database retains at most 128 user/field variants.
const facetCache = new WeakMap<Database.Database, Map<string, FacetCacheEntry>>();
const FACET_CACHE_MAX_ENTRIES = 128;
const FACET_CACHE_TTL_MS = 5 * 60 * 1_000;

function storedArray(value: unknown): unknown[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function facetName(value: unknown): string | null {
  const name = isRecord(value) ? value.name : value;
  return typeof name === 'string' && name ? name : null;
}

function deriveCollectionFacets(db: Database.Database, userId: number, mediaFieldId: number | null): CollectionFacets {
  const releases = db.prepare<[number], FacetRow>('SELECT genres, styles, formats, labels, year, notes FROM releases WHERE user_id = ?').all(userId);
  const genres = new Set<string>();
  const styles = new Set<string>();
  const formats = new Set<string>();
  const labels = new Set<string>();
  const decades = new Set<number>();
  const conditions = new Set<string>();

  for (const release of releases) {
    for (const genre of storedArray(release.genres)) {
      if (typeof genre === 'string' && genre) genres.add(genre);
    }
    for (const style of storedArray(release.styles)) {
      if (typeof style === 'string' && style) styles.add(style);
    }
    for (const format of storedArray(release.formats)) {
      const name = facetName(format);
      if (name) formats.add(name);
    }
    for (const label of storedArray(release.labels)) {
      const name = facetName(label);
      if (name) labels.add(name);
    }
    if (release.year && Number.isFinite(release.year)) {
      decades.add(Math.floor(release.year / 10) * 10);
    }
    for (const note of storedArray(release.notes)) {
      if (isRecord(note) && Number(note.field_id) === Number(mediaFieldId) && note.value) {
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
    conditions: [...conditions]
  };
}

function copyFilterOptions(facets: CollectionFacets, folders: CollectionFolder[]): CollectionFacets & { folders: CollectionFolder[] } {
  return {
    genres: [...facets.genres],
    styles: [...facets.styles],
    decades: [...facets.decades],
    formats: [...facets.formats],
    labels: [...facets.labels],
    conditions: [...facets.conditions],
    folders,
  };
}

export function getCollectionFilterOptions(
  db: Database.Database,
  userId: number,
  { folders = [], mediaFieldId = 1 }: { folders?: CollectionFolder[]; mediaFieldId?: number | null } = {},
): CollectionFacets & { folders: CollectionFolder[] } {
  // Never read or publish cached facets from a transaction's temporary snapshot.
  // Both its rows and revision can roll back after this read.
  if (db.inTransaction) {
    return copyFilterOptions(deriveCollectionFacets(db, userId, mediaFieldId), folders);
  }

  // Stamp before reading rows: a concurrent commit after the SELECT must not
  // associate older rows with the newer revision and keep them on the next page.
  const revision = getCollectionFacetRevision(db);
  const now = Date.now();
  let entries = facetCache.get(db);
  if (!entries) {
    entries = new Map();
    facetCache.set(db, entries);
  }
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }

  const key = `${userId}:${mediaFieldId}`;
  const cached = entries.get(key);
  if (cached && cached.revision === revision) {
    entries.delete(key);
    entries.set(key, cached);
    return copyFilterOptions(cached.facets, folders);
  }

  const facets = deriveCollectionFacets(db, userId, mediaFieldId);
  entries.delete(key);
  entries.set(key, { revision, expiresAt: now + FACET_CACHE_TTL_MS, facets });
  if (entries.size > FACET_CACHE_MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) entries.delete(oldestKey);
  }
  return copyFilterOptions(facets, folders);
}
