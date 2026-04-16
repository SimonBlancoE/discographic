import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { USER_PUBLIC_COLUMNS } from './lib/userView.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'discographic.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS discogs_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    discogs_username TEXT NOT NULL,
    discogs_token TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    release_id INTEGER NOT NULL,
    instance_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    year INTEGER,
    genres TEXT,
    styles TEXT,
    formats TEXT,
    labels TEXT,
    country TEXT,
    cover_url TEXT,
    rating INTEGER DEFAULT 0,
    notes TEXT,
    date_added TEXT,
    estimated_value REAL,
    listing_status TEXT DEFAULT NULL,
    listing_price REAL DEFAULT NULL,
    listing_currency TEXT DEFAULT NULL,
    listing_price_eur REAL DEFAULT NULL,
    tracklist TEXT,
    folder_id INTEGER DEFAULT 0,
    raw_json TEXT,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, instance_id)
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    started_at TEXT,
    finished_at TEXT,
    records_synced INTEGER,
    status TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_releases_user_artist ON releases(user_id, artist);
  CREATE INDEX IF NOT EXISTS idx_releases_user_title ON releases(user_id, title);
  CREATE INDEX IF NOT EXISTS idx_releases_user_year ON releases(user_id, year);
  CREATE INDEX IF NOT EXISTS idx_releases_user_date_added ON releases(user_id, date_added);
  CREATE INDEX IF NOT EXISTS idx_releases_user_value ON releases(user_id, estimated_value);
  CREATE INDEX IF NOT EXISTS idx_releases_user_release ON releases(user_id, release_id);
  CREATE INDEX IF NOT EXISTS idx_releases_user_listing_price_eur ON releases(user_id, listing_price_eur);
  CREATE INDEX IF NOT EXISTS idx_sync_log_user_started ON sync_log(user_id, started_at);
`);

export function parseJson(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Shape-narrowing parsers for the JSON-string columns on the releases table.
// Each guarantees the array shape its consumers expect even if the row was
// hand-edited or imported from an older schema; a malformed value collapses
// to [] rather than crashing the consumer's .find / .map.

function parseStringArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
}

function parseEntityArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

export const parseGenres = parseStringArray;
export const parseStyles = parseStringArray;
export const parseFormats = parseEntityArray;
export const parseLabels = parseEntityArray;
export const parseTracklist = parseEntityArray;

export function parseNotes(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => entry && typeof entry === 'object' && 'value' in entry);
}

export function stringifyJson(value, fallback = []) {
  return JSON.stringify(value ?? fallback);
}

export function normalizeNotes(notes) {
  if (!notes) {
    return [];
  }

  if (Array.isArray(notes)) {
    return notes;
  }

  if (typeof notes === 'string') {
    const trimmed = notes.trim();
    return trimmed ? [{ field_id: null, value: trimmed }] : [];
  }

  return [];
}

export function hydrateRelease(release) {
  if (!release) {
    return null;
  }

  const hydrated = { ...release };
  hydrated.genres = parseGenres(release.genres);
  hydrated.styles = parseStyles(release.styles);
  hydrated.formats = parseFormats(release.formats);
  hydrated.labels = parseLabels(release.labels);
  hydrated.notes = parseNotes(release.notes);
  hydrated.tracklist = parseTracklist(release.tracklist);
  hydrated.raw_json = release.raw_json ? parseJson(release.raw_json, {}) : null;
  hydrated.notes_text = hydrated.notes.map((item) => item.value).filter(Boolean).join(' | ');
  return hydrated;
}

export function withCoverUrls(release) {
  if (!release) return release;
  return {
    ...release,
    detail_cover_url: `/api/media/cover/${release.id}?variant=detail`,
    wall_cover_url: `/api/media/cover/${release.id}?variant=wall`,
    poster_cover_url: `/api/media/cover/${release.id}?variant=poster`
  };
}

export function getSettingForUser(userId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : fallback;
}

// Stores a primitive (string/number/boolean) as a string. Use setSettingJson
// for object/array values — String({...}) silently writes "[object Object]".
export function setSettingForUser(userId, key, value) {
  if (value !== null && typeof value === 'object') {
    throw new Error(`setSettingForUser('${key}') refuses object values; use setSettingJson`);
  }
  db.prepare(`
    INSERT INTO settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, String(value));
}

export function setSettingJson(userId, key, value) {
  db.prepare(`
    INSERT INTO settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, JSON.stringify(value));
}

export function getUserById(id) {
  return db.prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

export function getUserCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

export function createUser(username, passwordHash, role = 'user') {
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
  return getUserById(info.lastInsertRowid);
}

export function listUsers() {
  return db.prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users ORDER BY id ASC`).all();
}

export function deleteUser(id) {
  db.prepare('DELETE FROM discogs_accounts WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM releases WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM sync_log WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM settings WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function getUserAuthByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserAuthById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserPasswordHash(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  return getUserById(id);
}

export function getDiscogsAccount(userId) {
  return db.prepare(`
    SELECT user_id, discogs_username, discogs_token, created_at, updated_at
    FROM discogs_accounts
    WHERE user_id = ?
  `).get(userId);
}

export function upsertDiscogsAccount(userId, discogsUsername, discogsToken) {
  const current = getDiscogsAccount(userId);
  const nextToken = discogsToken || current?.discogs_token;
  if (!nextToken) {
    throw new Error('Discogs token is required');
  }

  db.prepare(`
    INSERT INTO discogs_accounts (user_id, discogs_username, discogs_token)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      discogs_username = excluded.discogs_username,
      discogs_token = excluded.discogs_token,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, discogsUsername, nextToken);

  return getDiscogsAccount(userId);
}

export function clearUserCollectionData(userId) {
  db.prepare('DELETE FROM releases WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sync_log WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
}

export default db;
