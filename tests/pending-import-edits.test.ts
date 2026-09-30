import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migratePendingImportEdits, pendingImportCounts, queueImportEdit } from '../server/services/pendingImportEdits.js';

it('adds durable storage to legacy SQLite without changing releases and migrates idempotently', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);
      INSERT INTO users VALUES (1), (2);
      CREATE TABLE releases (id INTEGER PRIMARY KEY, user_id INTEGER, instance_id INTEGER, rating INTEGER, notes TEXT);
      INSERT INTO releases VALUES (11, 1, 1001, 4, '[{"field_id":3,"value":"legacy"}]');`);
    const before = db.prepare('SELECT * FROM releases').all();
    migratePendingImportEdits(db);
    queueImportEdit(db, 1, 1001, 101, 0, 5);
    queueImportEdit(db, 2, 1001, 101, 0, 3);
    const pending = db.prepare('SELECT * FROM pending_import_edits ORDER BY user_id').all();
    migratePendingImportEdits(db);
    expect(db.prepare('SELECT * FROM releases').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM pending_import_edits ORDER BY user_id').all()).toEqual(pending);
    db.prepare('DELETE FROM releases WHERE id = 11').run();
    expect(pendingImportCounts(db, 1)).toEqual({ pending: 1, pendingFailed: 0 });
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(pendingImportCounts(db, 1)).toEqual({ pending: 0, pendingFailed: 0 });
    expect(pendingImportCounts(db, 2)).toEqual({ pending: 1, pendingFailed: 0 });
  } finally { db.close(); }
});
