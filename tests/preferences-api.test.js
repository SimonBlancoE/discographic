import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-preferences.db');

describe('Preferences storage (settings table)', () => {
  let db;

  function getSettingForUser(userId, key, fallback = null) {
    const row = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key);
    return row ? row.value : fallback;
  }

  function setSettingForUser(userId, key, value) {
    db.prepare(`
      INSERT INTO settings (user_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    `).run(userId, key, String(value));
  }

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE settings (
        user_id INTEGER,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key)
      )
    `);
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('returns fallback for non-existent key', () => {
    expect(getSettingForUser(1, 'nonexistent')).toBeNull();
    expect(getSettingForUser(1, 'nonexistent', 'default')).toBe('default');
  });

  it('stores and retrieves a preference', () => {
    const columns = JSON.stringify(['cover', 'artist', 'title', 'year']);
    setSettingForUser(1, 'collection_visible_columns', columns);
    expect(getSettingForUser(1, 'collection_visible_columns')).toBe(columns);
  });

  it('updates existing preference via upsert', () => {
    const columns1 = JSON.stringify(['cover', 'artist', 'title']);
    const columns2 = JSON.stringify(['cover', 'artist', 'title', 'listings']);
    setSettingForUser(1, 'collection_visible_columns', columns1);
    setSettingForUser(1, 'collection_visible_columns', columns2);
    expect(getSettingForUser(1, 'collection_visible_columns')).toBe(columns2);
  });

  it('isolates preferences per user', () => {
    setSettingForUser(1, 'test_key', 'user1');
    setSettingForUser(2, 'test_key', 'user2');
    expect(getSettingForUser(1, 'test_key')).toBe('user1');
    expect(getSettingForUser(2, 'test_key')).toBe('user2');
  });

  it('stored JSON can be parsed back', () => {
    const original = ['cover', 'artist', 'title', 'listings'];
    setSettingForUser(1, 'col_prefs', JSON.stringify(original));
    const stored = getSettingForUser(1, 'col_prefs');
    expect(JSON.parse(stored)).toEqual(original);
  });
});
