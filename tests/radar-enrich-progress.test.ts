import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  RADAR_ENRICH_CONDITION,
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
} from '../server/services/radarEnrichmentQueue.js';
import { migrateRadarStorage } from '../server/services/radarStorage.js';
import { MARKETPLACE_STATUS } from '../shared/contracts/radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-radar-enrich-progress.db');

describe('radar enrichment progress queue', () => {
  let db: Database.Database;

  beforeAll(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO radar_releases (user_id, release_id, title, artist, date_added, marketplace_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 101, 'Pending Release', 'Artist A', '2026-05-01', MARKETPLACE_STATUS.PENDING);

    db.prepare(`
      INSERT INTO radar_releases (user_id, release_id, title, artist, date_added, marketplace_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 102, 'Failed Release', 'Artist B', '2026-05-02', MARKETPLACE_STATUS.FAILED);

    db.prepare(`
      INSERT INTO radar_releases (user_id, release_id, title, artist, date_added, marketplace_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 103, 'Unavailable Release', 'Artist C', '2026-05-03', MARKETPLACE_STATUS.UNAVAILABLE);
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('builds a fixed workset for one Radar enrich run', () => {
    const initialCount = getPendingRadarEnrichmentCount(db, 1);
    const workset = getPendingRadarEnrichmentRows(db, 1);

    expect(initialCount).toBe(2);
    expect(workset).toHaveLength(2);
    expect(workset.map((row) => row.release_id)).toEqual([102, 101]);
  });

  it('priced and unavailable Radar rows leave the retry queue after a successful check', () => {
    const workset = getPendingRadarEnrichmentRows(db, 1);
    let processed = 0;

    for (const row of workset) {
      db.prepare(`
        UPDATE radar_releases
        SET estimated_price = ?,
            marketplace_status = ?,
            marketplace_last_checked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        row.release_id === 102 ? null : 12,
        row.release_id === 102 ? MARKETPLACE_STATUS.UNAVAILABLE : MARKETPLACE_STATUS.PRICED,
        row.id,
      );

      processed += 1;
    }

    expect(processed).toBe(2);
    expect(getPendingRadarEnrichmentCount(db, 1)).toBe(0);

    const stillPending = db.prepare(
      `SELECT COUNT(*) AS count FROM radar_releases WHERE user_id = 1 AND (${RADAR_ENRICH_CONDITION})`
    ).get() as { count: number };

    expect(stillPending.count).toBe(0);
  });

  it('failed Radar enrichment stays retryable and unavailable stays out of the queue', () => {
    db.prepare(`
      INSERT INTO radar_releases (user_id, release_id, title, artist, date_added, marketplace_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 104, 'Retry Release', 'Artist D', '2026-05-04', MARKETPLACE_STATUS.FAILED);

    const pending = getPendingRadarEnrichmentRows(db, 1).map((row) => row.release_id);
    const failed = db.prepare(`
      SELECT estimated_price, marketplace_status
      FROM radar_releases
      WHERE release_id = 104
    `).get() as { estimated_price: number | null; marketplace_status: string };
    const unavailable = db.prepare(`
      SELECT marketplace_status
      FROM radar_releases
      WHERE release_id = 103
    `).get() as { marketplace_status: string };

    expect(failed).toEqual({
      estimated_price: null,
      marketplace_status: MARKETPLACE_STATUS.FAILED,
    });
    expect(unavailable.marketplace_status).toBe(MARKETPLACE_STATUS.UNAVAILABLE);
    expect(pending).toContain(104);
    expect(pending).not.toContain(103);
  });
});
