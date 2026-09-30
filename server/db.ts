// @ts-nocheck
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getNoteFieldText, normalizeNotes, parseStoredNotes } from './services/notes.js';
import { parseJson, stringifyJson } from './services/jsonStorage.js';
import { runDatabaseSchemaLifecycle } from './services/databaseSchemaLifecycle.js';
import { normalizeCollectionFieldMap, normalizeCollectionFolders } from '../shared/contracts/collectionFields.js';
import { resetRadarRuntimeState } from './services/radarRuntimeState.js';
import { clearRadarRows, getRadarSnapshot, updateRadarLocalDecision } from './services/radarStorage.js';
import { resolveRuntimePaths } from './runtimePaths.js';
import { cancelUserJobs } from './services/userJobs.js';
import { clearCollectionValueSnapshots } from './services/collectionValue.js';
import { clearPendingImportEdits } from './services/pendingImportEdits.js';
import { USER_PREFERENCE_KEYS } from '../shared/contracts/preferences.js';

const { dataDir } = resolveRuntimePaths(import.meta.url);

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'discographic.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

runDatabaseSchemaLifecycle(db);

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
