// @ts-nocheck
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanupStoredNotes, getNoteFieldText, normalizeNotes, parseStoredNotes } from './services/notes.js';
import { parseJson, stringifyJson } from './services/jsonStorage.js';
import { migrateCommunityColumns, migrateMarketplaceStatus } from './services/dbMigrations.js';
import { normalizeCollectionFieldMap, normalizeCollectionFolders } from '../shared/contracts/collectionFields.js';
import { resetRadarRuntimeState } from './services/radarRuntimeState.js';
import { clearRadarRows, getRadarSnapshot, migrateRadarStorage, updateRadarLocalDecision } from './services/radarStorage.js';
import { resolveRuntimePaths } from './runtimePaths.js';
import { cancelUserJobs } from './services/userJobs.js';
import { clearCollectionValueSnapshots, migrateCollectionValueSnapshots } from './services/collectionValue.js';
import { migratePendingImportEdits, clearPendingImportEdits } from './services/pendingImportEdits.js';
import { USER_PREFERENCE_KEYS } from '../shared/contracts/preferences.js';

const { dataDir } = resolveRuntimePaths(import.meta.url);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'discographic.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function getColumns(tableName) {
  if (!tableExists(tableName)) {
    return [];
  }

  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function hasColumn(tableName, columnName) {
  return getColumns(tableName).some((column) => column.name === columnName);
}

function createBaseTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      auth_epoch INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS releases_v2 (
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
      marketplace_status TEXT DEFAULT 'pending',
      listing_status TEXT DEFAULT NULL,
      listing_price REAL DEFAULT NULL,
      listing_currency TEXT DEFAULT NULL,
      listing_price_eur REAL DEFAULT NULL,
      last_seen_sync_id INTEGER DEFAULT NULL,
      tracklist TEXT,
      folder_id INTEGER DEFAULT 0,
      raw_json TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, instance_id)
    );

    CREATE TABLE IF NOT EXISTS sync_log_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      started_at TEXT,
      finished_at TEXT,
      records_synced INTEGER,
      status TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings_v2 (
      user_id INTEGER,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function migrateReleases() {
  const releaseColumns = getColumns('releases');
  const v2Columns = getColumns('releases_v2');

  if (tableExists('releases') && !v2Columns.length) {
    throw new Error('Table releases_v2 was not created');
  }

  if (tableExists('releases') && releaseColumns.some((column) => column.name === 'release_id')) {
    db.exec('DROP TABLE IF EXISTS releases_v2');
    db.exec('ALTER TABLE releases RENAME TO releases_v2_current');
    db.exec('ALTER TABLE releases_v2_current RENAME TO releases');
    return;
  }

  if (!tableExists('releases')) {
    db.exec('ALTER TABLE releases_v2 RENAME TO releases');
    return;
  }

  const hasLegacyRows = db.prepare('SELECT COUNT(*) AS count FROM releases_v2').get().count > 0;
  if (!hasLegacyRows && releaseColumns.length) {
    db.exec(`
      INSERT INTO releases_v2 (
        user_id, release_id, instance_id, title, artist, year, genres, styles,
        formats, labels, country, cover_url, rating, notes, date_added,
        estimated_value, tracklist, folder_id, raw_json, synced_at
      )
      SELECT
        ${hasColumn('releases', 'user_id') ? 'user_id' : 'NULL'},
        ${hasColumn('releases', 'release_id') ? 'release_id' : 'id'},
        instance_id,
        title,
        artist,
        year,
        genres,
        styles,
        formats,
        labels,
        country,
        cover_url,
        rating,
        notes,
        date_added,
        estimated_value,
        tracklist,
        folder_id,
        raw_json,
        synced_at
      FROM releases
    `);
  }

  db.exec('DROP TABLE releases');
  db.exec('ALTER TABLE releases_v2 RENAME TO releases');
}

function migrateSyncLog() {
  if (!tableExists('sync_log')) {
    db.exec('ALTER TABLE sync_log_v2 RENAME TO sync_log');
    return;
  }

  const hasLegacyRows = db.prepare('SELECT COUNT(*) AS count FROM sync_log_v2').get().count > 0;
  if (!hasLegacyRows) {
    db.exec(`
      INSERT INTO sync_log_v2 (user_id, started_at, finished_at, records_synced, status)
      SELECT ${hasColumn('sync_log', 'user_id') ? 'user_id' : 'NULL'}, started_at, finished_at, records_synced, status
      FROM sync_log
    `);
  }

  db.exec('DROP TABLE sync_log');
  db.exec('ALTER TABLE sync_log_v2 RENAME TO sync_log');
}

function migrateSettings() {
  if (!tableExists('settings')) {
    db.exec('ALTER TABLE settings_v2 RENAME TO settings');
    return;
  }

  const hasLegacyRows = db.prepare('SELECT COUNT(*) AS count FROM settings_v2').get().count > 0;
  if (!hasLegacyRows) {
    db.exec(`
      INSERT INTO settings_v2 (user_id, key, value)
      SELECT ${hasColumn('settings', 'user_id') ? 'user_id' : 'NULL'}, key, value
      FROM settings
    `);
  }

  db.exec('DROP TABLE settings');
  db.exec('ALTER TABLE settings_v2 RENAME TO settings');
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_releases_user_artist ON releases(user_id, artist);
    CREATE INDEX IF NOT EXISTS idx_releases_user_title ON releases(user_id, title);
    CREATE INDEX IF NOT EXISTS idx_releases_user_year ON releases(user_id, year);
    CREATE INDEX IF NOT EXISTS idx_releases_user_date_added ON releases(user_id, date_added);
    CREATE INDEX IF NOT EXISTS idx_releases_user_value ON releases(user_id, estimated_value);
    CREATE INDEX IF NOT EXISTS idx_releases_user_marketplace_status ON releases(user_id, marketplace_status);
    CREATE INDEX IF NOT EXISTS idx_releases_user_release ON releases(user_id, release_id);
    CREATE INDEX IF NOT EXISTS idx_releases_user_listing_price_eur ON releases(user_id, listing_price_eur);
    CREATE INDEX IF NOT EXISTS idx_releases_user_last_seen_sync ON releases(user_id, last_seen_sync_id);
    CREATE INDEX IF NOT EXISTS idx_sync_log_user_started ON sync_log(user_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_releases_user_master ON releases(user_id, master_id);
    CREATE INDEX IF NOT EXISTS idx_releases_user_want ON releases(user_id, community_want);
  `);
}

function migrateUsersRole() {
  if (tableExists('users') && !hasColumn('users', 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  // First user is always admin
  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (first) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id);
  }
}

function migrateUserAuthEpoch() {
  if (!hasColumn('users', 'auth_epoch')) {
    db.exec('ALTER TABLE users ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 0');
  }
}

function migrateListingColumns() {
  if (!hasColumn('releases', 'listing_status')) {
    db.exec('ALTER TABLE releases ADD COLUMN listing_status TEXT DEFAULT NULL');
  }
  if (!hasColumn('releases', 'listing_price')) {
    db.exec('ALTER TABLE releases ADD COLUMN listing_price REAL DEFAULT NULL');
  }
  if (!hasColumn('releases', 'listing_currency')) {
    db.exec('ALTER TABLE releases ADD COLUMN listing_currency TEXT DEFAULT NULL');
  }
  if (!hasColumn('releases', 'listing_price_eur')) {
    db.exec('ALTER TABLE releases ADD COLUMN listing_price_eur REAL DEFAULT NULL');
  }
}

function migrateLastSeenSyncId() {
  if (!hasColumn('releases', 'last_seen_sync_id')) {
    db.exec('ALTER TABLE releases ADD COLUMN last_seen_sync_id INTEGER DEFAULT NULL');
  }
}

createBaseTables();
migrateReleases();
migrateSyncLog();
migrateSettings();
migrateUsersRole();
migrateUserAuthEpoch();
migrateListingColumns();
migrateLastSeenSyncId();
migrateMarketplaceStatus(db);
migrateCommunityColumns(db);
migrateCollectionValueSnapshots(db);
migrateRadarStorage(db);
migratePendingImportEdits(db);
createIndexes();
cleanupStoredNotes(db);

export { normalizeNotes, parseJson, stringifyJson };

export function hydrateRelease(release) {
  if (!release) {
    return null;
  }

  const hydrated = { ...release };
  hydrated.genres = parseJson(release.genres, []);
  hydrated.styles = parseJson(release.styles, []);
  hydrated.formats = parseJson(release.formats, []);
  hydrated.labels = parseJson(release.labels, []);
  hydrated.notes = normalizeNotes(parseStoredNotes(release.notes));
  hydrated.tracklist = parseJson(release.tracklist, []);
  hydrated.raw_json = release.raw_json ? parseJson(release.raw_json, {}) : null;
  const fieldMap = getCollectionFieldMap(release.user_id);
  hydrated.notes_text = getNoteFieldText(hydrated.notes, fieldMap.notesFieldId);
  hydrated.media_condition = fieldMap.mediaFieldId ? getNoteFieldText(hydrated.notes, fieldMap.mediaFieldId) || null : null;
  hydrated.sleeve_condition = fieldMap.sleeveFieldId ? getNoteFieldText(hydrated.notes, fieldMap.sleeveFieldId) || null : null;
  return hydrated;
}

const COLLECTION_FIELDS_KEY = 'discogs_collection_fields';
const COLLECTION_FOLDERS_KEY = 'discogs_collection_folders';
const fieldMapCache = new Map();

export function getCollectionFieldMap(userId) {
  if (userId == null) {
    return normalizeCollectionFieldMap(null);
  }

  if (!fieldMapCache.has(userId)) {
    fieldMapCache.set(userId, normalizeCollectionFieldMap(parseJson(getSettingForUser(userId, COLLECTION_FIELDS_KEY), null)));
  }

  return fieldMapCache.get(userId);
}

export function setCollectionFieldMap(userId, discogsFieldsPayload) {
  const map = normalizeCollectionFieldMap(discogsFieldsPayload);
  setSettingForUser(userId, COLLECTION_FIELDS_KEY, JSON.stringify(map));
  fieldMapCache.set(userId, map);
  return map;
}

export function hasStoredCollectionFieldMap(userId) {
  return getSettingForUser(userId, COLLECTION_FIELDS_KEY) != null;
}

export function getCollectionFolders(userId) {
  return normalizeCollectionFolders(parseJson(getSettingForUser(userId, COLLECTION_FOLDERS_KEY), []));
}

export function setCollectionFolders(userId, discogsFoldersPayload) {
  const folders = normalizeCollectionFolders(discogsFoldersPayload);
  setSettingForUser(userId, COLLECTION_FOLDERS_KEY, JSON.stringify(folders));
  return folders;
}

export function getSettingForUser(userId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : fallback;
}

export function setSettingForUser(userId, key, value) {
  db.prepare(`
    INSERT INTO settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, String(value));
}


type UserRow = {
  id: number;
  username: string;
  role: string;
  created_at: string | null;
  auth_epoch: number;
};
type UserAuthRow = UserRow & { password_hash: string };
type DiscogsAccountRow = {
  user_id: number;
  discogs_username: string;
  discogs_token: string;
  created_at: string | null;
  updated_at: string | null;
};

export function getUserById(id) {
  return db.prepare<[number], UserRow>('SELECT id, username, role, created_at, auth_epoch FROM users WHERE id = ?').get(id);
}

export function getUserCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

export function createUser(username, passwordHash, role = 'user') {
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
  return getUserById(Number(info.lastInsertRowid))!;
}

export function listUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
}

export function deleteUser(id) {
  cancelUserJobs(id);
  clearPendingImportEdits(db, id);
  fieldMapCache.delete(id);
  clearCollectionValueSnapshots(db, id);
  resetRadarRuntimeState(id);
  db.prepare('DELETE FROM discogs_accounts WHERE user_id = ?').run(id);
  clearRadarRows(db, id);
  db.prepare('DELETE FROM releases WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM sync_log WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM settings WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function getUserAuthByUsername(username) {
  return db.prepare<[string], UserAuthRow>('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserAuthById(id) {
  return db.prepare<[number], UserAuthRow>('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserPasswordHash(id: number, passwordHash: string, expectedAuthEpoch: number | undefined = undefined) {
  const result = expectedAuthEpoch === undefined
    ? db.prepare('UPDATE users SET password_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').run(passwordHash, id)
    : db.prepare('UPDATE users SET password_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ? AND auth_epoch = ?').run(passwordHash, id, expectedAuthEpoch);
  return result.changes ? getUserById(id) : null;
}

export function getDiscogsAccount(userId) {
  return db.prepare<[number], DiscogsAccountRow>(`
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
  cancelUserJobs(userId);
  clearPendingImportEdits(db, userId);
  fieldMapCache.delete(userId);
  clearCollectionValueSnapshots(db, userId);
  resetRadarRuntimeState(userId);
  clearRadarRows(db, userId);
  db.prepare('DELETE FROM releases WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sync_log WHERE user_id = ?').run(userId);
  const keep = USER_PREFERENCE_KEYS.map(() => '?').join(', ');
  db.prepare(`DELETE FROM settings WHERE user_id = ? AND key NOT IN (${keep})`).run(userId, ...USER_PREFERENCE_KEYS);
}

export function migrateLegacyDataToUser(userId) {
  db.prepare('UPDATE releases SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE sync_log SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE settings SET user_id = ? WHERE user_id IS NULL').run(userId);
}

export function getRadarForUser(userId) {
  return getRadarSnapshot(db, userId);
}

export function updateRadarReleaseForUser(userId, radarId, patch) {
  return updateRadarLocalDecision(db, {
    userId,
    radarId,
    ...patch,
  });
}

export default db;
