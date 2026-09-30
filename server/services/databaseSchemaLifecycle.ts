import type Database from 'better-sqlite3';
import { cleanupStoredNotes } from './notes.js';
import { migrateCommunityColumns, migrateMarketplaceStatus } from './dbMigrations.js';
import { migrateCollectionValueSnapshots } from './collectionValue.js';
import { migrateRadarStorage } from './radarStorage.js';
import { migratePendingImportEdits } from './pendingImportEdits.js';

export type DatabaseSchemaLifecycleReport = {
  completedStages: string[];
  cleanedNoteRows: number;
};

export type DatabaseSchemaCleanupHooks = {
  // SQL-only cleanup participates in the startup transaction. Defaults to real notes cleanup.
  cleanupStoredNotes?: (db: Database.Database) => number;
};

/** Creates, migrates, indexes and cleans SQLite through the same entry used at app startup. */
export function runDatabaseSchemaLifecycle(
  db: Database.Database,
  hooks: DatabaseSchemaCleanupHooks = {},
): DatabaseSchemaLifecycleReport {
  function tableExists(name: string): boolean {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  function getColumns(tableName: string): Array<{ name: string }> {
    if (!tableExists(tableName)) {
      return [];
    }

    return db.prepare<[], { name: string }>(`PRAGMA table_info(${tableName})`).all();
  }

  function hasColumn(tableName: string, columnName: string): boolean {
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

    const hasLegacyRows = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM releases_v2').get()!.count > 0;
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

    const hasLegacyRows = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM sync_log_v2').get()!.count > 0;
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

    const hasLegacyRows = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM settings_v2').get()!.count > 0;
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
    const first = db.prepare<[], { id: number }>('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
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

  // A failed migration or cleanup must leave the previous schema/data available for retry.
  return db.transaction(() => {
    const completedStages: string[] = [];
    function stage(name: string, execute: () => void): void {
      execute();
      completedStages.push(name);
    }
    stage('base-tables', () => createBaseTables());
    stage('releases', () => migrateReleases());
    stage('sync-log', () => migrateSyncLog());
    stage('settings', () => migrateSettings());
    stage('user-role', () => migrateUsersRole());
    stage('auth-epoch', () => migrateUserAuthEpoch());
    stage('listing-columns', () => migrateListingColumns());
    stage('last-seen-sync', () => migrateLastSeenSyncId());
    stage('marketplace', () => migrateMarketplaceStatus(db));
    stage('community', () => migrateCommunityColumns(db));
    stage('collection-value', () => migrateCollectionValueSnapshots(db));
    stage('radar', () => migrateRadarStorage(db));
    stage('pending-import-edits', () => migratePendingImportEdits(db));
    stage('indexes', () => createIndexes());
    const cleanedNoteRows = (hooks.cleanupStoredNotes ?? cleanupStoredNotes)(db);
    completedStages.push('notes-cleanup');
    return { completedStages, cleanedNoteRows };
  })();
}
