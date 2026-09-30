import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDatabaseSchemaLifecycle } from '../server/services/databaseSchemaLifecycle.js';
import { cleanupStoredNotes } from '../server/services/notes.js';
import { queueImportEdit, pendingImportCounts } from '../server/services/pendingImportEdits.js';

// Historical fixture definitions only: every upgrade runs the production startup entry.
const legacyReleaseColumns = `
  instance_id INTEGER NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL,
  year INTEGER, genres TEXT, styles TEXT, formats TEXT, labels TEXT, country TEXT,
  cover_url TEXT, rating INTEGER DEFAULT 0, notes TEXT, date_added TEXT,
  estimated_value REAL, tracklist TEXT, folder_id INTEGER DEFAULT 0,
  raw_json TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP`;

describe('Database schema lifecycle', () => {
  let db: Database.Database;
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'discographic-schema-'));
    db = new Database(join(directory, 'fixture.db'));
    db.pragma('foreign_keys = ON');
  });
  afterEach(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

  function columns(table: string): string[] {
    return db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all().map(column => column.name);
  }
  function tables(): string[] {
    return db.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(table => table.name);
  }
  function seedLegacy(userScoped = false) {
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT);
      INSERT INTO users VALUES (7, 'first', 'hash-one', '2020-01-01'), (8, 'second', 'hash-two', '2020-01-02');
      CREATE TABLE releases (id INTEGER PRIMARY KEY, ${userScoped ? 'user_id INTEGER, release_id INTEGER NOT NULL,' : ''}
        ${legacyReleaseColumns});
      CREATE TABLE sync_log (id INTEGER PRIMARY KEY, ${userScoped ? 'user_id INTEGER,' : ''}
        started_at TEXT, finished_at TEXT, records_synced INTEGER, status TEXT);
      CREATE TABLE settings (${userScoped ? 'user_id INTEGER,' : ''} key TEXT, value TEXT);
      INSERT INTO sync_log (${userScoped ? 'user_id,' : ''} started_at, finished_at, records_synced, status)
        VALUES (${userScoped ? '7,' : ''} 'start', 'finish', 2, 'completed');
      INSERT INTO settings VALUES (${userScoped ? '7,' : ''} 'currency', 'EUR');`);
    const insert = db.prepare(`INSERT INTO releases (id, ${userScoped ? 'user_id, release_id,' : ''}
      instance_id, title, artist, estimated_value, notes, raw_json)
      VALUES (?, ${userScoped ? '7, 101,' : ''} ?, 'Old title', 'Old artist', ?, ?, ?)`);
    insert.run(101, 1001, 25, '  old note  ', JSON.stringify({ basic_information: { master_id: 123 }, community: { have: 10, want: 20, rating: { average: 4.5, count: 2 } }, num_for_sale: 3 }));
    insert.run(102, 1002, 0, '[]', '{invalid-json');
  }

  it('creates the complete current schema, defaults, constraints and indexes from an empty database', () => {
    const report = runDatabaseSchemaLifecycle(db);
    expect(report.cleanedNoteRows).toBe(0);
    expect(tables()).toEqual(['collection_value_snapshots', 'discogs_accounts', 'pending_import_edits', 'radar_releases', 'releases', 'settings', 'sync_log', 'users']);
    db.prepare("INSERT INTO users (id, username, password_hash) VALUES (1, 'one', 'hash'), (2, 'two', 'hash')").run();
    db.prepare("INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 10, 20, 'Title', 'Artist'), (2, 10, 20, 'Other', 'Artist')").run();
    expect(db.prepare('SELECT auth_epoch FROM users WHERE id = 1').get()).toEqual({ auth_epoch: 0 });
    expect(db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur, last_seen_sync_id, marketplace_status FROM releases WHERE user_id = 1').get()).toEqual({
      listing_status: null, listing_price: null, listing_currency: null, listing_price_eur: null, last_seen_sync_id: null, marketplace_status: 'pending',
    });
    expect(() => db.prepare("INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 11, 20, 'Duplicate', 'Artist')").run()).toThrow(/UNIQUE/);
    expect(() => queueImportEdit(db, 999, 20, 10, 0, 5)).toThrow(/FOREIGN KEY/);
    expect(() => queueImportEdit(db, 1, 20, 10, -1, 'bad')).toThrow(/CHECK/);
    expect(db.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(index => index.name)).toEqual(expect.arrayContaining([
      'idx_releases_user_marketplace_status', 'idx_releases_user_listing_price_eur', 'idx_releases_user_last_seen_sync', 'idx_releases_user_master', 'idx_releases_user_want', 'idx_sync_log_user_started', 'idx_radar_releases_user_status',
    ]));
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it.each([false, true])('upgrades legacy data without losing identities, account scope or settings (user scoped: %s)', userScoped => {
    seedLegacy(userScoped);
    const report = runDatabaseSchemaLifecycle(db);
    expect(report.cleanedNoteRows).toBe(1);
    expect(db.prepare('SELECT user_id, release_id, instance_id, title, notes, estimated_value, marketplace_status, master_id, community_have, community_want, community_rating, community_rating_count, num_for_sale FROM releases ORDER BY instance_id').all()).toEqual([
      { user_id: userScoped ? 7 : null, release_id: 101, instance_id: 1001, title: 'Old title', notes: '[{"field_id":null,"value":"old note"}]', estimated_value: 25, marketplace_status: userScoped ? 'priced' : 'pending', master_id: 123, community_have: 10, community_want: 20, community_rating: 4.5, community_rating_count: 2, num_for_sale: 3 },
      { user_id: userScoped ? 7 : null, release_id: userScoped ? 101 : 102, instance_id: 1002, title: 'Old title', notes: '[]', estimated_value: null, marketplace_status: 'pending', master_id: null, community_have: null, community_want: null, community_rating: null, community_rating_count: null, num_for_sale: null },
    ]);
    expect(db.prepare('SELECT user_id, started_at, finished_at, records_synced, status FROM sync_log').get()).toEqual({ user_id: userScoped ? 7 : null, started_at: 'start', finished_at: 'finish', records_synced: 2, status: 'completed' });
    expect(db.prepare('SELECT * FROM settings').get()).toEqual({ user_id: userScoped ? 7 : null, key: 'currency', value: 'EUR' });
    expect(db.prepare('SELECT id, role, auth_epoch, password_hash FROM users ORDER BY id').all()).toEqual([
      { id: 7, role: 'admin', auth_epoch: 0, password_hash: 'hash-one' }, { id: 8, role: 'user', auth_epoch: 0, password_hash: 'hash-two' },
    ]);
    expect(columns('releases')).toEqual(expect.arrayContaining(['listing_status', 'listing_price', 'listing_currency', 'listing_price_eur', 'last_seen_sync_id']));
    expect(tables().some(name => name.endsWith('_v2'))).toBe(false);
  });

  it('repeated startup preserves current prices, auth epochs, durable edits, Radar decisions and snapshots', () => {
    runDatabaseSchemaLifecycle(db);
    db.exec(`INSERT INTO users (id, username, password_hash, auth_epoch) VALUES (1, 'one', 'hash', 4);
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, listing_status, listing_price, listing_currency, listing_price_eur, last_seen_sync_id, marketplace_status, estimated_value, notes)
        VALUES (1, 101, 1001, 'Title', 'Artist', 'For Sale', 29.99, 'USD', 18.18, 42, 'ready', 12, '[]');
      INSERT INTO radar_releases (user_id, release_id, title, artist, local_note) VALUES (1, 202, 'Want', 'Artist', 'Keep my decision');
      INSERT INTO collection_value_snapshots VALUES (1, '2026-01-01', 'EUR', 1, 2, 3, '2026-01-01');`);
    queueImportEdit(db, 1, 1001, 101, 0, 5);
    const pending = db.prepare('SELECT * FROM pending_import_edits').all();
    expect(runDatabaseSchemaLifecycle(db).cleanedNoteRows).toBe(0);
    expect(runDatabaseSchemaLifecycle(db).cleanedNoteRows).toBe(0);
    expect(db.prepare('SELECT auth_epoch, role FROM users').get()).toEqual({ auth_epoch: 4, role: 'admin' });
    expect(db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur, last_seen_sync_id, estimated_value, marketplace_status FROM releases').get()).toEqual({ listing_status: 'For Sale', listing_price: 29.99, listing_currency: 'USD', listing_price_eur: 18.18, last_seen_sync_id: 42, estimated_value: 12, marketplace_status: 'priced' });
    expect(db.prepare('SELECT * FROM pending_import_edits').all()).toEqual(pending);
    expect(db.prepare('SELECT local_note FROM radar_releases').get()).toEqual({ local_note: 'Keep my decision' });
    expect(db.prepare('SELECT median FROM collection_value_snapshots').get()).toEqual({ median: 2 });
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(pendingImportCounts(db, 1)).toEqual({ pending: 0, pendingFailed: 0 });
  });

  it('upgrades existing Radar columns while preserving stored decisions', () => {
    seedLegacy(true);
    db.exec(`CREATE TABLE radar_releases (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
      release_id INTEGER NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, local_note TEXT, created_at TEXT, updated_at TEXT);
      INSERT INTO radar_releases VALUES (1, 7, 201, 'Wanted', 'Artist', 'Keep', '2026-01-01', '2026-01-01');`);
    runDatabaseSchemaLifecycle(db);
    expect(db.prepare('SELECT local_note, local_priority, marketplace_status, source_status FROM radar_releases').get()).toEqual({ local_note: 'Keep', local_priority: 'normal', marketplace_status: 'pending', source_status: 'active' });
  });

  it('runs the optional cleanup hook after every schema stage and returns its result', () => {
    seedLegacy();
    const report = runDatabaseSchemaLifecycle(db, { cleanupStoredNotes: openDb => {
      queueImportEdit(openDb, 7, 1001, 101, 0, 5);
      expect(columns('users')).toContain('auth_epoch');
      expect(openDb.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_releases_user_master'").get()).toBeDefined();
      return cleanupStoredNotes(openDb);
    } });
    expect(report.cleanedNoteRows).toBe(1);
    expect(report.completedStages).toEqual(['base-tables', 'releases', 'sync-log', 'settings', 'user-role', 'auth-epoch', 'listing-columns', 'last-seen-sync', 'marketplace', 'community', 'collection-value', 'radar', 'pending-import-edits', 'indexes', 'notes-cleanup']);
    expect(pendingImportCounts(db, 7).pending).toBe(1);
  });

  it('rolls back table replacement, incremental migrations and cleanup writes if cleanup fails', () => {
    seedLegacy();
    const originalTables = tables();
    const rows = db.prepare('SELECT * FROM releases ORDER BY id').all();
    expect(() => runDatabaseSchemaLifecycle(db, { cleanupStoredNotes: openDb => {
      cleanupStoredNotes(openDb);
      queueImportEdit(openDb, 7, 1001, 101, 0, 5);
      throw new Error('Injected cleanup failure');
    } })).toThrow('Injected cleanup failure');
    expect(tables()).toEqual(originalTables);
    expect(db.prepare('SELECT * FROM releases ORDER BY id').all()).toEqual(rows);
    expect(columns('users')).not.toContain('auth_epoch');
    expect(runDatabaseSchemaLifecycle(db).cleanedNoteRows).toBe(1);
  });

  it('propagates a SQLite migration failure and leaves the original legacy schema retryable', () => {
    seedLegacy();
    db.exec('ALTER TABLE releases DROP COLUMN tracklist');
    const originalTables = tables();
    expect(() => runDatabaseSchemaLifecycle(db)).toThrow(/tracklist/);
    expect(tables()).toEqual(originalTables);
    expect(db.prepare('SELECT COUNT(*) AS count FROM releases').get()).toEqual({ count: 2 });
    expect(columns('releases')).not.toContain('release_id');
    expect(columns('users')).not.toContain('auth_epoch');
  });
});
