import type { Database } from 'better-sqlite3';

type IdentityField = 'id' | 'release_id' | 'instance_id';
type ColumnMap = Record<string, { type: string; dbField: string }>;

type ImportRelease = {
  id: number;
  release_id: number;
  instance_id: number;
  artist: string;
  title: string;
  rating: number | null;
  notes: string | null;
};

type IdentityRejection = 'unmatched' | 'invalidIdentity' | 'inconsistentIdentity' | 'ambiguousIdentity';
type IdentityResult =
  | { release: ImportRelease; reason?: never }
  | { release: null; reason: IdentityRejection };

// Instance identity narrows a Discogs release to a particular collection copy.
// Every additional supplied identity must agree with that copy.
const IDENTITY_FIELDS: IdentityField[] = ['instance_id', 'id', 'release_id'];

function isIdentityField(field: string): field is IdentityField {
  return IDENTITY_FIELDS.some(candidate => candidate === field);
}

function parseIdentity(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function resolveImportIdentity(
  db: Database,
  userId: number,
  row: Record<string, unknown>,
  columnMap: ColumnMap,
): IdentityResult {
  const identities = new Map<IdentityField, number>();
  for (const [header, mapping] of Object.entries(columnMap)) {
    if (mapping.type !== 'id' || !isIdentityField(mapping.dbField)) continue;
    const raw = row[header];
    if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) continue;
    const value = parseIdentity(raw);
    if (value === null) return { release: null, reason: 'invalidIdentity' };
    const previous = identities.get(mapping.dbField);
    if (previous !== undefined && previous !== value) return { release: null, reason: 'inconsistentIdentity' };
    identities.set(mapping.dbField, value);
  }

  const fields = IDENTITY_FIELDS.filter(field => identities.has(field));
  if (!fields.length) return { release: null, reason: 'unmatched' };

  const matches = db.prepare<number[], ImportRelease>(
    `SELECT id, release_id, instance_id, artist, title, rating, notes FROM releases
     WHERE user_id = ? AND ${fields.map(field => `${field} = ?`).join(' AND ')} LIMIT 2`,
  ).all(userId, ...fields.map(field => identities.get(field)!));

  if (matches.length > 1) return { release: null, reason: 'ambiguousIdentity' };
  if (!matches.length) return { release: null, reason: fields.length > 1 ? 'inconsistentIdentity' : 'unmatched' };
  return { release: matches[0] };
}
