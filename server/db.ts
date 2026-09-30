import type { NormalizedUser } from '../shared/contracts/account.js';
import type { CollectionRelease } from '../shared/contracts/release.js';
import type { CollectionFieldMap } from '../shared/contracts/collectionFields.js';

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getNoteFieldText, normalizeNotes, parseStoredNotes } from './services/notes.js';
import { parseJson, parseJsonArray, stringifyJson } from './services/jsonStorage.js';
import { runDatabaseSchemaLifecycle } from './services/databaseSchemaLifecycle.js';
import { normalizeCollectionFieldMap, normalizeCollectionFolders } from '../shared/contracts/collectionFields.js';
import { resetRadarRuntimeState } from './services/radarRuntimeState.js';
import { clearRadarRows, getRadarSnapshot, updateRadarLocalDecision } from './services/radarStorage.js';
import { resolveRuntimePaths } from './runtimePaths.js';
import { cancelUserJobs } from './services/userJobs.js';
import { clearCollectionValueSnapshots } from './services/collectionValue.js';
import { clearPendingImportEdits } from './services/pendingImportEdits.js';
import { USER_PREFERENCE_KEYS } from '../shared/contracts/preferences.js';

// JSON columns remain untrusted until hydration; numeric identities follow the SQLite schema.
export type ReleaseRow = Omit<CollectionRelease,
  | 'genres' | 'styles' | 'formats' | 'labels' | 'notes'
  | 'notes_text' | 'media_condition' | 'sleeve_condition' | 'display_currency'
  | 'id' | 'release_id' | 'instance_id' | 'rating' | 'folder_id' | 'marketplace_status'
> & {
  id: number; release_id: number; instance_id: number;
  rating: number | null; folder_id: number | null; marketplace_status: string | null;
  genres: string | null; styles: string | null; formats: string | null; labels: string | null;
  notes: string | null; tracklist: string | null; raw_json: string | null;
};

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

type HydratedRelease<T> = Omit<T, 'genres' | 'styles' | 'formats' | 'labels' | 'notes' | 'tracklist' | 'raw_json'> & {
  genres: unknown[]; styles: unknown[]; formats: unknown[]; labels: unknown[];
  notes: ReturnType<typeof normalizeNotes>; tracklist: unknown[]; raw_json: unknown;
  notes_text: string; media_condition: string | null; sleeve_condition: string | null;
};
export function hydrateRelease<T extends Partial<ReleaseRow>>(release: T): HydratedRelease<T>;
export function hydrateRelease<T extends Partial<ReleaseRow>>(release: T | null | undefined): HydratedRelease<T> | null;
export function hydrateRelease(release: Partial<ReleaseRow> | null | undefined) {
  if (!release) return null;
  const notes = normalizeNotes(parseStoredNotes(release.notes));
  const fieldMap = getCollectionFieldMap(release.user_id);
  return {
    ...release,
    genres: parseJsonArray(release.genres),
    styles: parseJsonArray(release.styles),
    formats: parseJsonArray(release.formats),
    labels: parseJsonArray(release.labels),
    notes,
    tracklist: parseJsonArray(release.tracklist),
    raw_json: release.raw_json ? parseJson<unknown>(release.raw_json, {}) : null,
    notes_text: getNoteFieldText(notes, fieldMap.notesFieldId),
    media_condition: fieldMap.mediaFieldId ? getNoteFieldText(notes, fieldMap.mediaFieldId) || null : null,
    sleeve_condition: fieldMap.sleeveFieldId ? getNoteFieldText(notes, fieldMap.sleeveFieldId) || null : null,
  };
}

const COLLECTION_FIELDS_KEY = 'discogs_collection_fields';
const COLLECTION_FOLDERS_KEY = 'discogs_collection_folders';
const fieldMapCache = new Map<number, CollectionFieldMap>();

export function getCollectionFieldMap(userId: number | null | undefined) {
  if (userId == null) {
    return normalizeCollectionFieldMap(null);
  }

  if (!fieldMapCache.has(userId)) {
    fieldMapCache.set(userId, normalizeCollectionFieldMap(parseJson(getSettingForUser(userId, COLLECTION_FIELDS_KEY), null)));
  }

  return fieldMapCache.get(userId)!;
}

export function setCollectionFieldMap(userId: number, discogsFieldsPayload: unknown) {
  const map = normalizeCollectionFieldMap(discogsFieldsPayload);
  setSettingForUser(userId, COLLECTION_FIELDS_KEY, JSON.stringify(map));
  fieldMapCache.set(userId, map);
  return map;
}

export function hasStoredCollectionFieldMap(userId: number) {
  return getSettingForUser(userId, COLLECTION_FIELDS_KEY) != null;
}

export function getCollectionFolders(userId: number) {
  return normalizeCollectionFolders(parseJson(getSettingForUser(userId, COLLECTION_FOLDERS_KEY), []));
}

export function setCollectionFolders(userId: number, discogsFoldersPayload: unknown) {
  const folders = normalizeCollectionFolders(discogsFoldersPayload);
  setSettingForUser(userId, COLLECTION_FOLDERS_KEY, JSON.stringify(folders));
  return folders;
}

export function getSettingForUser(userId: number, key: string, fallback: string | null = null) {
  const row = db.prepare<[number, string], { value: string | null }>('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : fallback;
}

export function setSettingForUser(userId: number, key: string, value: unknown) {
  db.prepare(`
    INSERT INTO settings (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, String(value));
}


export type UserRow = NormalizedUser & { auth_epoch: number };
type UserAuthRow = UserRow & { password_hash: string };
export type DiscogsAccountRow = {
  user_id: number;
  discogs_username: string;
  discogs_token: string;
  created_at: string | null;
  updated_at: string | null;
};

export function getUserById(id: number) {
  return db.prepare<[number], UserRow>('SELECT id, username, role, created_at, auth_epoch FROM users WHERE id = ?').get(id);
}

export function getUserCount() {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM users').get()!.count;
}

export function createUser(username: string, passwordHash: string, role = 'user') {
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
  return getUserById(Number(info.lastInsertRowid))!;
}

export function listUsers() {
  return db.prepare<[], Omit<UserRow, 'auth_epoch'>>('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
}

export function deleteUser(id: number) {
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

export function getUserAuthByUsername(username: string) {
  return db.prepare<[string], UserAuthRow>('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserAuthById(id: number) {
  return db.prepare<[number], UserAuthRow>('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserPasswordHash(id: number, passwordHash: string, expectedAuthEpoch: number | undefined = undefined) {
  const result = expectedAuthEpoch === undefined
    ? db.prepare('UPDATE users SET password_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ?').run(passwordHash, id)
    : db.prepare('UPDATE users SET password_hash = ?, auth_epoch = auth_epoch + 1 WHERE id = ? AND auth_epoch = ?').run(passwordHash, id, expectedAuthEpoch);
  return result.changes ? getUserById(id) : null;
}

export function getDiscogsAccount(userId: number) {
  return db.prepare<[number], DiscogsAccountRow>(`
    SELECT user_id, discogs_username, discogs_token, created_at, updated_at
    FROM discogs_accounts
    WHERE user_id = ?
  `).get(userId);
}

export function upsertDiscogsAccount(userId: number, discogsUsername: string, discogsToken?: string) {
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

export function clearUserCollectionData(userId: number) {
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

export function migrateLegacyDataToUser(userId: number) {
  db.prepare('UPDATE releases SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE sync_log SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE settings SET user_id = ? WHERE user_id IS NULL').run(userId);
}

export function getRadarForUser(userId: number) {
  return getRadarSnapshot(db, userId);
}

export function updateRadarReleaseForUser(userId: number, radarId: number, patch: Omit<Parameters<typeof updateRadarLocalDecision>[1], 'userId' | 'radarId'>) {
  return updateRadarLocalDecision(db, {
    userId,
    radarId,
    ...patch,
  });
}

export default db;
