import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pruneUnseenReleases } from '../server/services/collectionReconcile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-collection-reconcile.db');

describe('collection reconciliation', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        last_seen_sync_id INTEGER DEFAULT NULL,
        UNIQUE(user_id, instance_id)
      )
    `);

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, last_seen_sync_id)
      VALUES
        (1, 1001, 1, 'Album A', 'Artist A', 41),
        (1, 1002, 2, 'Album B', 'Artist B', 42),
        (1, 1003, 3, 'Album C', 'Artist C', NULL),
        (2, 2001, 1, 'Album D', 'Artist D', 41)
    `).run();
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('deletes rows not seen in the latest sync for the target user', () => {
    const removedIds = pruneUnseenReleases(db, 1, 42);

    expect(removedIds).toEqual([1, 3]);

    const remaining = db.prepare(`
      SELECT id, release_id, last_seen_sync_id
      FROM releases
      WHERE user_id = 1
      ORDER BY id ASC
    `).all();

    expect(remaining).toEqual([
      { id: 2, release_id: 1002, last_seen_sync_id: 42 }
    ]);
  });

  it('does not affect rows belonging to other users', () => {
    const otherUserRows = db.prepare(`
      SELECT id, release_id, last_seen_sync_id
      FROM releases
      WHERE user_id = 2
    `).all();

    expect(otherUserRows).toEqual([
      { id: 4, release_id: 2001, last_seen_sync_id: 41 }
    ]);
  });

  it('returns an empty array when there is nothing to prune', () => {
    const removedIds = pruneUnseenReleases(db, 1, 42);
    expect(removedIds).toEqual([]);
  });

  it('prunes all rows when a successful sync sees zero records', () => {
    const removedIds = pruneUnseenReleases(db, 2, 999);

    expect(removedIds).toEqual([4]);

    const remaining = db.prepare('SELECT COUNT(*) AS count FROM releases WHERE user_id = 2').get().count;
    expect(remaining).toBe(0);
  });
});
