import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-migration.db');

describe('num_for_sale migration', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');

    // Create releases table without num_for_sale (simulates pre-migration state)
    db.exec(`
      CREATE TABLE releases (
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
        tracklist TEXT,
        folder_id INTEGER DEFAULT 0,
        raw_json TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, instance_id)
      )
    `);
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('table initially has no num_for_sale column', () => {
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).not.toContain('num_for_sale');
  });

  it('migration adds num_for_sale column', () => {
    const hasCol = db.prepare('PRAGMA table_info(releases)').all().some(c => c.name === 'num_for_sale');
    if (!hasCol) {
      db.exec('ALTER TABLE releases ADD COLUMN num_for_sale INTEGER DEFAULT NULL');
    }
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).toContain('num_for_sale');
  });

  it('migration is idempotent', () => {
    const hasCol = db.prepare('PRAGMA table_info(releases)').all().some(c => c.name === 'num_for_sale');
    if (!hasCol) {
      db.exec('ALTER TABLE releases ADD COLUMN num_for_sale INTEGER DEFAULT NULL');
    }
    // Should not throw
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).toContain('num_for_sale');
  });

  it('num_for_sale defaults to NULL for existing rows', () => {
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 100, 200, 'Test', 'Artist')`).run();
    const row = db.prepare('SELECT num_for_sale FROM releases WHERE release_id = 100').get();
    expect(row.num_for_sale).toBeNull();
  });

  it('num_for_sale can store integer values', () => {
    db.prepare(`UPDATE releases SET num_for_sale = 42 WHERE release_id = 100`).run();
    const row = db.prepare('SELECT num_for_sale FROM releases WHERE release_id = 100').get();
    expect(row.num_for_sale).toBe(42);
  });

  it('num_for_sale 0 is distinct from NULL', () => {
    db.prepare(`UPDATE releases SET num_for_sale = 0 WHERE release_id = 100`).run();
    const row = db.prepare('SELECT num_for_sale FROM releases WHERE release_id = 100').get();
    expect(row.num_for_sale).toBe(0);
    expect(row.num_for_sale).not.toBeNull();
  });
});
