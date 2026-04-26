import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ENRICH_CONDITION, getPendingEnrichmentCount, getPendingEnrichmentRows } from '../server/services/enrichmentQueue.js';
import { MARKETPLACE_STATUS } from '../shared/contracts/marketplace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-enrich-progress.db');

describe('enrichment progress queue', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        estimated_value REAL,
        marketplace_status TEXT,
        country TEXT,
        tracklist TEXT,
        date_added TEXT,
        synced_at TEXT
      )
    `);

    db.prepare(`INSERT INTO releases (user_id, release_id, estimated_value, marketplace_status, country, tracklist, date_added) VALUES (1, 101, NULL, ?, NULL, '[]', '2026-04-01')`).run(MARKETPLACE_STATUS.PENDING);
    db.prepare(`INSERT INTO releases (user_id, release_id, estimated_value, marketplace_status, country, tracklist, date_added) VALUES (1, 102, NULL, ?, NULL, '[]', '2026-04-02')`).run(MARKETPLACE_STATUS.FAILED);
    db.prepare(`INSERT INTO releases (user_id, release_id, estimated_value, marketplace_status, country, tracklist, date_added) VALUES (1, 103, NULL, ?, NULL, '[]', '2026-04-03')`).run(MARKETPLACE_STATUS.UNAVAILABLE);
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('builds a fixed workset for one enrich run', () => {
    const initialCount = getPendingEnrichmentCount(db, 1);
    const workset = getPendingEnrichmentRows(db, 1);

    expect(initialCount).toBe(2);
    expect(workset).toHaveLength(2);
    expect(workset.map((row) => row.release_id)).toEqual([102, 101]);
  });

  it('enriched rows are no longer pending even when country is still null', () => {
    const workset = getPendingEnrichmentRows(db, 1);
    let processed = 0;

    for (const row of workset) {
      db.prepare(`
        UPDATE releases
        SET estimated_value = 10,
            marketplace_status = ?,
            country = COALESCE(?, country),
            tracklist = '[{"position":"A1","title":"Track"}]'
        WHERE id = ?
      `).run(MARKETPLACE_STATUS.PRICED, null, row.id);

      processed += 1;
    }

    expect(processed).toBe(2);

    const finalPending = getPendingEnrichmentCount(db, 1);
    expect(finalPending).toBe(0);

    const stillPending = db.prepare(`SELECT COUNT(*) AS count FROM releases WHERE user_id = 1 AND (${ENRICH_CONDITION})`).get().count;
    expect(stillPending).toBe(0);
  });

  it('failed enrichment stays retryable and does not become a fake priced row', () => {
    db.prepare(`
      INSERT INTO releases (user_id, release_id, estimated_value, marketplace_status, country, tracklist, date_added)
      VALUES (1, 104, NULL, ?, NULL, '[]', '2026-04-04')
    `).run(MARKETPLACE_STATUS.FAILED);

    const pending = getPendingEnrichmentRows(db, 1).map((row) => row.release_id);
    const failed = db.prepare('SELECT estimated_value, marketplace_status FROM releases WHERE release_id = 104').get();

    expect(failed).toEqual({ estimated_value: null, marketplace_status: MARKETPLACE_STATUS.FAILED });
    expect(pending).toContain(104);
  });

  it('unavailable rows stay out of the retry queue', () => {
    const unavailable = db.prepare('SELECT marketplace_status FROM releases WHERE release_id = 103').get();
    const pending = getPendingEnrichmentRows(db, 1).map((row) => row.release_id);

    expect(unavailable.marketplace_status).toBe(MARKETPLACE_STATUS.UNAVAILABLE);
    expect(pending).not.toContain(103);
  });
});
