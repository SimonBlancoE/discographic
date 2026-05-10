import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  clearRadarRows,
  getRadarAvailabilityTransition,
  getRadarSnapshot,
  migrateRadarStorage,
  updateRadarLocalDecision,
} from '../server/services/radarStorage.js';
import {
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_STATUS,
} from '../shared/contracts/radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-radar-storage.db');

describe('radar storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '',
        artist TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE radar_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        release_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL
      )
    `);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('migrates Radar storage columns idempotently', () => {
    migrateRadarStorage(db);
    migrateRadarStorage(db);

    const columns = (db.prepare('PRAGMA table_info(radar_releases)').all() as Array<{ name: string }>).map(
      (column) => column.name,
    );

    expect(columns).toEqual(expect.arrayContaining([
      'cover_url',
      'year',
      'date_added',
      'local_priority',
      'local_target_price_eur',
      'local_minimum_condition',
      'local_note',
      'local_hidden',
      'local_resolved',
      'source_discogs',
      'source_file',
      'source_status',
      'source_last_seen_at',
      'marketplace_status',
      'estimated_price',
      'listing_status',
      'listing_price',
      'listing_currency',
      'listing_price_eur',
      'marketplace_last_checked_at',
      'created_at',
      'updated_at',
    ]));
  });

  it('returns user-scoped Radar items and summary counts and clears one user without touching another', () => {
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        year,
        local_priority,
        local_hidden,
        local_resolved,
        source_discogs,
        source_file,
        source_status,
        marketplace_status,
        estimated_price,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      101,
      'User One Release',
      'Artist A',
      1999,
      RADAR_PRIORITY.HIGH,
      0,
      0,
      1,
      0,
      RADAR_SOURCE_STATUS.ACTIVE,
      MARKETPLACE_STATUS.PRICED,
      25,
      '2026-05-10T00:00:00Z',
      '2026-05-10T00:00:00Z',
    );

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        local_hidden,
        local_resolved,
        source_discogs,
        source_file,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2,
      202,
      'User Two Release',
      'Artist B',
      1,
      1,
      1,
      1,
      RADAR_SOURCE_STATUS.MISSING,
      MARKETPLACE_STATUS.FAILED,
    );

    expect(getRadarSnapshot(db, 1)).toEqual({
      items: [
        {
          id: 1,
          user_id: 1,
          release_id: 101,
          title: 'User One Release',
          artist: 'Artist A',
          year: 1999,
          cover_url: null,
          date_added: null,
          local: {
            priority: RADAR_PRIORITY.HIGH,
            target_price: null,
            target_price_eur: null,
            minimum_condition: null,
            note: '',
            hidden: false,
            resolved: false,
          },
          source: {
            origin: 'discogs',
            status: RADAR_SOURCE_STATUS.ACTIVE,
            last_seen_at: null,
          },
          marketplace: {
            status: MARKETPLACE_STATUS.PRICED,
            estimated_price: 25,
            listing_status: null,
            listing_price: null,
            listing_currency: null,
            listing_price_eur: null,
            last_checked_at: null,
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: ['high_priority_available'],
            default_visible: true,
            is_in_collection: false,
          },
          display_currency: null,
        },
      ],
      summary: {
        total: 1,
        active: 1,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 1,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });

    expect(getRadarSnapshot(db, 2).summary).toEqual({
      total: 1,
      active: 0,
      hidden: 1,
      resolved: 1,
      missingFromSource: 1,
      priced: 0,
      pending: 0,
      failed: 1,
      unavailable: 0,
    });

    clearRadarRows(db, 1);

    expect(getRadarSnapshot(db, 1)).toEqual({
      items: [],
      summary: {
        total: 0,
        active: 0,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });
    expect(getRadarSnapshot(db, 2).items).toHaveLength(1);
  });

  it('updates local Radar decisions for one release without touching another row', () => {
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        local_priority,
        local_target_price_eur,
        local_minimum_condition,
        local_note,
        local_hidden,
        local_resolved,
        source_discogs,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      303,
      'Editable Release',
      'Artist C',
      RADAR_PRIORITY.NORMAL,
      12,
      null,
      '',
      0,
      0,
      1,
      RADAR_SOURCE_STATUS.ACTIVE,
      MARKETPLACE_STATUS.PENDING,
    );

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        local_priority,
        local_target_price_eur,
        local_note,
        source_discogs,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      404,
      'Untouched Release',
      'Artist D',
      RADAR_PRIORITY.LOW,
      9,
      'keep me',
      1,
      RADAR_SOURCE_STATUS.ACTIVE,
      MARKETPLACE_STATUS.PRICED,
    );

    const updated = updateRadarLocalDecision(db, {
      userId: 1,
      radarId: 1,
      priority: RADAR_PRIORITY.HIGH,
      targetPriceEur: 18.25,
      minimumCondition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
      note: 'Watch for clean cover',
      hidden: true,
      resolved: true,
    });

    expect(updated).toBe(true);

    const snapshot = getRadarSnapshot(db, 1);
    const editable = snapshot.items.find((item) => item.id === 1);
    const untouched = snapshot.items.find((item) => item.id === 2);

    expect(editable?.local).toEqual({
      priority: RADAR_PRIORITY.HIGH,
      target_price: null,
      target_price_eur: 18.25,
      minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
      note: 'Watch for clean cover',
      hidden: true,
      resolved: true,
    });

    expect(untouched?.local).toEqual({
      priority: RADAR_PRIORITY.LOW,
      target_price: null,
      target_price_eur: 9,
      minimum_condition: null,
      note: 'keep me',
      hidden: false,
      resolved: false,
    });
  });

  it('derives opportunity reasons, already-owned flags, and default ordering for the active Radar list', () => {
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 404, 1, 'Owned Release', 'Artist D');

    const insertRadar = db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        date_added,
        local_priority,
        local_target_price_eur,
        local_hidden,
        local_resolved,
        source_discogs,
        source_status,
        marketplace_status,
        estimated_price,
        marketplace_last_unavailable_at,
        marketplace_available_again_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRadar.run(1, 401, 'Below Target', 'Artist A', '2026-05-01', RADAR_PRIORITY.NORMAL, 20, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 18, null, null);
    insertRadar.run(1, 402, 'High Priority Available', 'Artist B', '2026-05-02', RADAR_PRIORITY.HIGH, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 24, null, null);
    insertRadar.run(1, 403, 'Available Again', 'Artist C', '2026-05-03', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 26, '2026-05-08T00:00:00Z', '2026-05-10T00:00:00Z');
    insertRadar.run(1, 404, 'Owned Release', 'Artist D', '2026-05-04', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 28, null, null);
    insertRadar.run(1, 405, 'Pending Release', 'Artist E', '2026-05-05', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PENDING, null, null, null);
    insertRadar.run(1, 406, 'Failed Release', 'Artist F', '2026-05-06', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.FAILED, null, null, null);
    insertRadar.run(1, 407, 'Unavailable Release', 'Artist G', '2026-05-07', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.UNAVAILABLE, null, null, null);
    insertRadar.run(1, 408, 'Rest Normal Newer', 'Artist H', '2026-05-09', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 30, null, null);
    insertRadar.run(1, 409, 'Rest Low Older', 'Artist I', '2026-05-01', RADAR_PRIORITY.LOW, null, 0, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 31, null, null);
    insertRadar.run(1, 410, 'Hidden Release', 'Artist J', '2026-05-10', RADAR_PRIORITY.HIGH, 40, 1, 0, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 10, null, null);
    insertRadar.run(1, 411, 'Resolved Release', 'Artist K', '2026-05-10', RADAR_PRIORITY.HIGH, null, 0, 1, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 12, null, null);
    insertRadar.run(1, 412, 'Missing Release', 'Artist L', '2026-05-10', RADAR_PRIORITY.NORMAL, null, 0, 0, 1, RADAR_SOURCE_STATUS.MISSING, MARKETPLACE_STATUS.PRICED, 12, null, null);

    const snapshot = getRadarSnapshot(db, 1);
    const items = snapshot.items as Array<{
      release_id: number;
      opportunity: {
        reasons: string[];
        default_visible: boolean;
        is_in_collection: boolean;
      };
    }>;

    expect(items.find((item) => item.release_id === 401)?.opportunity.reasons).toEqual(['below_target']);
    expect(items.find((item) => item.release_id === 402)?.opportunity.reasons).toEqual(['high_priority_available']);
    expect(items.find((item) => item.release_id === 403)?.opportunity.reasons).toEqual(['available_again']);
    expect(items.find((item) => item.release_id === 404)?.opportunity).toEqual({
      reasons: ['already_in_collection'],
      default_visible: true,
      is_in_collection: true,
    });

    expect(items.find((item) => item.release_id === 410)?.opportunity.default_visible).toBe(false);
    expect(items.find((item) => item.release_id === 411)?.opportunity.default_visible).toBe(false);
    expect(items.find((item) => item.release_id === 412)?.opportunity.default_visible).toBe(false);

    const visibleReleaseIds = items
      .filter((item) => item.opportunity.default_visible)
      .map((item) => item.release_id);

    expect(visibleReleaseIds.slice(0, 4)).toEqual([401, 402, 403, 404]);
    expect(visibleReleaseIds.slice(4, 7)).toEqual(expect.arrayContaining([405, 406, 407]));
    expect(visibleReleaseIds.slice(7)).toEqual([408, 409]);
  });

  it('tracks when a release becomes available again after an unavailable Marketplace state', () => {
    expect(getRadarAvailabilityTransition(MARKETPLACE_STATUS.UNAVAILABLE, MARKETPLACE_STATUS.PRICED)).toEqual({
      markUnavailableNow: false,
      markAvailableAgainNow: true,
      clearAvailableAgain: false,
    });

    expect(getRadarAvailabilityTransition(MARKETPLACE_STATUS.PRICED, MARKETPLACE_STATUS.UNAVAILABLE)).toEqual({
      markUnavailableNow: true,
      markAvailableAgainNow: false,
      clearAvailableAgain: true,
    });

    expect(getRadarAvailabilityTransition(MARKETPLACE_STATUS.FAILED, MARKETPLACE_STATUS.PRICED)).toEqual({
      markUnavailableNow: false,
      markAvailableAgainNow: false,
      clearAvailableAgain: false,
    });
  });
});
