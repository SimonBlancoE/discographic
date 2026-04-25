import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { migrateMarketplaceStatus } from '../server/services/dbMigrations.js';
import { MARKETPLACE_STATUS } from '../server/services/marketplaceValue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-marketplace-migration.db');

describe('migrateMarketplaceStatus', () => {
  let db;

  beforeEach(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        estimated_value REAL,
        UNIQUE(user_id, instance_id)
      )
    `);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  function insertRow(values = {}) {
    const { release_id = 1, instance_id = 1, estimated_value = null } = values;
    db.prepare(
      'INSERT INTO releases (user_id, release_id, instance_id, title, artist, estimated_value) VALUES (1, ?, ?, ?, ?, ?)'
    ).run(release_id, instance_id, 't', 'a', estimated_value);
  }

  it('adds marketplace_status column when missing', () => {
    insertRow({ estimated_value: 12.5 });
    migrateMarketplaceStatus(db);
    const cols = db.prepare('PRAGMA table_info(releases)').all().map((c) => c.name);
    expect(cols).toContain('marketplace_status');
  });

  it('backfills PRICED for rows with positive estimated_value on first run', () => {
    insertRow({ release_id: 1, instance_id: 1, estimated_value: 15 });
    insertRow({ release_id: 2, instance_id: 2, estimated_value: 0 });
    insertRow({ release_id: 3, instance_id: 3, estimated_value: null });
    migrateMarketplaceStatus(db);
    const rows = db.prepare('SELECT release_id, marketplace_status, estimated_value FROM releases ORDER BY release_id').all();
    expect(rows[0].marketplace_status).toBe(MARKETPLACE_STATUS.PRICED);
    expect(rows[1].marketplace_status).toBe(MARKETPLACE_STATUS.PENDING);
    expect(rows[1].estimated_value).toBeNull();
    expect(rows[2].marketplace_status).toBe(MARKETPLACE_STATUS.PENDING);
  });

  it('converts legacy ready statuses to priced on re-run', () => {
    insertRow({ release_id: 1, instance_id: 1, estimated_value: 15 });
    migrateMarketplaceStatus(db);
    db.prepare("UPDATE releases SET marketplace_status = 'ready' WHERE release_id = 1").run();

    migrateMarketplaceStatus(db);

    const row = db.prepare('SELECT marketplace_status FROM releases WHERE release_id = 1').get();
    expect(row.marketplace_status).toBe(MARKETPLACE_STATUS.PRICED);
  });

  it('preserves existing non-default statuses on re-run', () => {
    insertRow({ release_id: 1, instance_id: 1, estimated_value: 15 });
    migrateMarketplaceStatus(db);
    db.prepare('UPDATE releases SET marketplace_status = ? WHERE release_id = 1').run(MARKETPLACE_STATUS.FAILED);
    migrateMarketplaceStatus(db);
    const row = db.prepare('SELECT marketplace_status FROM releases WHERE release_id = 1').get();
    expect(row.marketplace_status).toBe(MARKETPLACE_STATUS.FAILED);
  });

  it('does not run backfill UPDATE on subsequent runs', () => {
    insertRow({ release_id: 1, instance_id: 1, estimated_value: 15 });
    migrateMarketplaceStatus(db);
    db.prepare('UPDATE releases SET marketplace_status = ?').run(MARKETPLACE_STATUS.UNAVAILABLE);
    migrateMarketplaceStatus(db);
    const row = db.prepare('SELECT marketplace_status FROM releases WHERE release_id = 1').get();
    expect(row.marketplace_status).toBe(MARKETPLACE_STATUS.UNAVAILABLE);
  });
});
