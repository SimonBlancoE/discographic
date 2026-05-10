import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  clearRadarRows,
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
});
