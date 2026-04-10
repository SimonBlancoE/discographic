import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-migration.db');

describe('listing columns migration', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');

    // Create releases table without listing columns (simulates pre-migration state)
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        year INTEGER,
        estimated_value REAL,
        tracklist TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, instance_id)
      )
    `);
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('table initially has no listing columns', () => {
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).not.toContain('listing_status');
    expect(cols).not.toContain('listing_price');
  });

  it('migration adds listing_status and listing_price columns', () => {
    const hasCols = (col) => db.prepare('PRAGMA table_info(releases)').all().some(c => c.name === col);
    if (!hasCols('listing_status')) {
      db.exec('ALTER TABLE releases ADD COLUMN listing_status TEXT DEFAULT NULL');
    }
    if (!hasCols('listing_price')) {
      db.exec('ALTER TABLE releases ADD COLUMN listing_price REAL DEFAULT NULL');
    }
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).toContain('listing_status');
    expect(cols).toContain('listing_price');
  });

  it('migration is idempotent', () => {
    // Running again should not throw
    const hasCols = (col) => db.prepare('PRAGMA table_info(releases)').all().some(c => c.name === col);
    if (!hasCols('listing_status')) {
      db.exec('ALTER TABLE releases ADD COLUMN listing_status TEXT DEFAULT NULL');
    }
    if (!hasCols('listing_price')) {
      db.exec('ALTER TABLE releases ADD COLUMN listing_price REAL DEFAULT NULL');
    }
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    expect(cols).toContain('listing_status');
    expect(cols).toContain('listing_price');
  });

  it('listing columns default to NULL for existing rows', () => {
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 100, 200, 'Test', 'Artist')`).run();
    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE release_id = 100').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
  });

  it('listing_status stores text values', () => {
    db.prepare(`UPDATE releases SET listing_status = 'For Sale' WHERE release_id = 100`).run();
    const row = db.prepare('SELECT listing_status FROM releases WHERE release_id = 100').get();
    expect(row.listing_status).toBe('For Sale');
  });

  it('listing_price stores decimal values', () => {
    db.prepare(`UPDATE releases SET listing_price = 29.99 WHERE release_id = 100`).run();
    const row = db.prepare('SELECT listing_price FROM releases WHERE release_id = 100').get();
    expect(row.listing_price).toBeCloseTo(29.99);
  });

  it('NULL listing_status means not listed', () => {
    db.prepare(`UPDATE releases SET listing_status = NULL, listing_price = NULL WHERE release_id = 100`).run();
    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE release_id = 100').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
  });
});
