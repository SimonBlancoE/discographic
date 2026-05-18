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
  type RadarCollectionMatch,
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
        artist TEXT NOT NULL DEFAULT '',
        date_added TEXT DEFAULT NULL
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
      'marketplace_last_checked_at',
      'marketplace_last_unavailable_at',
      'marketplace_available_again_at',
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
            last_checked_at: null,
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: [],
            default_visible: true,
            is_in_collection: false,
            collection_match: null,
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

  it('derives collection flags and default Wantlist ordering for the active Radar list', () => {
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

    type RadarOrderingFixture = {
      releaseId: number;
      title: string;
      artist: string;
      dateAdded: string;
      priority?: string;
      targetPriceEur?: number | null;
      hidden?: boolean;
      resolved?: boolean;
      sourceStatus?: string;
      marketplaceStatus?: string;
      estimatedPrice?: number | null;
      lastUnavailableAt?: string | null;
      availableAgainAt?: string | null;
    };

    function insertRadarFixture({
      releaseId,
      title,
      artist,
      dateAdded,
      priority = RADAR_PRIORITY.NORMAL,
      targetPriceEur = null,
      hidden = false,
      resolved = false,
      sourceStatus = RADAR_SOURCE_STATUS.ACTIVE,
      marketplaceStatus = MARKETPLACE_STATUS.PRICED,
      estimatedPrice = null,
      lastUnavailableAt = null,
      availableAgainAt = null,
    }: RadarOrderingFixture): void {
      insertRadar.run(
        1,
        releaseId,
        title,
        artist,
        dateAdded,
        priority,
        targetPriceEur,
        hidden ? 1 : 0,
        resolved ? 1 : 0,
        1,
        sourceStatus,
        marketplaceStatus,
        estimatedPrice,
        lastUnavailableAt,
        availableAgainAt,
      );
    }

    const radarFixtures: RadarOrderingFixture[] = [
      {
        releaseId: 401,
        title: 'Below Target',
        artist: 'Artist A',
        dateAdded: '2026-05-01',
        targetPriceEur: 20,
        estimatedPrice: 18,
      },
      {
        releaseId: 402,
        title: 'High Priority Available',
        artist: 'Artist B',
        dateAdded: '2026-05-02',
        priority: RADAR_PRIORITY.HIGH,
        estimatedPrice: 24,
      },
      {
        releaseId: 403,
        title: 'Available Again',
        artist: 'Artist C',
        dateAdded: '2026-05-03',
        estimatedPrice: 26,
        lastUnavailableAt: '2026-05-08T00:00:00Z',
        availableAgainAt: '2026-05-10T00:00:00Z',
      },
      {
        releaseId: 404,
        title: 'Owned Release',
        artist: 'Artist D',
        dateAdded: '2026-05-04',
        estimatedPrice: 28,
      },
      {
        releaseId: 405,
        title: 'Pending Release',
        artist: 'Artist E',
        dateAdded: '2026-05-05',
        marketplaceStatus: MARKETPLACE_STATUS.PENDING,
      },
      {
        releaseId: 406,
        title: 'Failed Release',
        artist: 'Artist F',
        dateAdded: '2026-05-06',
        marketplaceStatus: MARKETPLACE_STATUS.FAILED,
      },
      {
        releaseId: 407,
        title: 'Unavailable Release',
        artist: 'Artist G',
        dateAdded: '2026-05-07',
        marketplaceStatus: MARKETPLACE_STATUS.UNAVAILABLE,
      },
      {
        releaseId: 408,
        title: 'Rest Normal Newer',
        artist: 'Artist H',
        dateAdded: '2026-05-09',
        estimatedPrice: 30,
      },
      {
        releaseId: 409,
        title: 'Rest Low Older',
        artist: 'Artist I',
        dateAdded: '2026-05-01',
        priority: RADAR_PRIORITY.LOW,
        estimatedPrice: 31,
      },
      {
        releaseId: 410,
        title: 'Hidden Release',
        artist: 'Artist J',
        dateAdded: '2026-05-10',
        priority: RADAR_PRIORITY.HIGH,
        targetPriceEur: 40,
        hidden: true,
        estimatedPrice: 10,
      },
      {
        releaseId: 411,
        title: 'Resolved Release',
        artist: 'Artist K',
        dateAdded: '2026-05-10',
        priority: RADAR_PRIORITY.HIGH,
        resolved: true,
        estimatedPrice: 12,
      },
      {
        releaseId: 412,
        title: 'Missing Release',
        artist: 'Artist L',
        dateAdded: '2026-05-10',
        sourceStatus: RADAR_SOURCE_STATUS.MISSING,
        estimatedPrice: 12,
      },
    ];

    for (const fixture of radarFixtures) {
      insertRadarFixture(fixture);
    }

    const snapshot = getRadarSnapshot(db, 1);
    const items = snapshot.items as Array<{
      release_id: number;
      opportunity: {
        reasons: string[];
        default_visible: boolean;
        is_in_collection: boolean;
        collection_match: RadarCollectionMatch | null;
      };
    }>;

    expect(items.find((item) => item.release_id === 401)?.opportunity.reasons).toEqual([]);
    expect(items.find((item) => item.release_id === 402)?.opportunity.reasons).toEqual([]);
    expect(items.find((item) => item.release_id === 403)?.opportunity.reasons).toEqual([]);
    expect(items.find((item) => item.release_id === 404)?.opportunity).toEqual({
      reasons: [],
      default_visible: true,
      is_in_collection: true,
      collection_match: {
        primary_release_id: 1,
        copy_count: 1,
      },
    });

    expect(items.find((item) => item.release_id === 410)?.opportunity.default_visible).toBe(false);
    expect(items.find((item) => item.release_id === 411)?.opportunity.default_visible).toBe(false);
    expect(items.find((item) => item.release_id === 412)?.opportunity.default_visible).toBe(false);

    const visibleReleaseIds = items
      .filter((item) => item.opportunity.default_visible)
      .map((item) => item.release_id);

    expect(visibleReleaseIds).toEqual([402, 408, 407, 406, 405, 404, 403, 401, 409]);
  });

  it('does not derive Wantlist manager signals from Marketplace price state', () => {
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 704, 1, 'Owned Release', 'Artist D');

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        date_added,
        local_priority,
        local_target_price_eur,
        source_discogs,
        source_status,
        marketplace_status,
        estimated_price,
        marketplace_last_unavailable_at,
        marketplace_available_again_at
      )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 701, 'Below Target Price', 'Artist A', '2026-05-01', RADAR_PRIORITY.NORMAL, 20, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 18, null, null,
      1, 702, 'High Priority Priced', 'Artist B', '2026-05-02', RADAR_PRIORITY.HIGH, null, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 24, null, null,
      1, 703, 'Available Again', 'Artist C', '2026-05-03', RADAR_PRIORITY.NORMAL, null, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 26, '2026-05-08T00:00:00Z', '2026-05-10T00:00:00Z',
      1, 704, 'Owned Release', 'Artist D', '2026-05-04', RADAR_PRIORITY.NORMAL, null, 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PRICED, 28, null, null,
    );

    const snapshot = getRadarSnapshot(db, 1);

    expect(snapshot.items.map((item) => [item.release_id, item.opportunity.reasons])).toEqual([
      [702, []],
      [704, []],
      [703, []],
      [701, []],
    ]);
    expect(snapshot.items.find((item) => item.release_id === 704)?.opportunity).toMatchObject({
      default_visible: true,
      is_in_collection: true,
      collection_match: {
        primary_release_id: 1,
        copy_count: 1,
      },
    });
  });

  it('exposes user-scoped collection match targets and copy counts for no match, one copy, and multiple copies', () => {
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, date_added)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 602, 1, 'Single Copy', 'Artist B', '2026-05-02T00:00:00Z');

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, date_added)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 603, 2, 'Older Copy', 'Artist C', '2026-05-01T00:00:00Z');

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, date_added)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 603, 3, 'Newer Copy', 'Artist C', '2026-05-03T00:00:00Z');

    db.prepare(`
      INSERT INTO releases (user_id, release_id, instance_id, title, artist, date_added)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(2, 603, 4, 'Other User Copy', 'Artist C', '2026-05-04T00:00:00Z');

    const insertRadar = db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        source_discogs,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertRadar.run(1, 601, 'No Match', 'Artist A', 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PENDING);
    insertRadar.run(1, 602, 'Single Match', 'Artist B', 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PENDING);
    insertRadar.run(1, 603, 'Multiple Match', 'Artist C', 1, RADAR_SOURCE_STATUS.ACTIVE, MARKETPLACE_STATUS.PENDING);

    const items = getRadarSnapshot(db, 1).items;

    expect(items.find((item) => item.release_id === 601)?.opportunity).toMatchObject({
      is_in_collection: false,
      collection_match: null,
    });

    expect(items.find((item) => item.release_id === 602)?.opportunity).toMatchObject({
      is_in_collection: true,
      collection_match: {
        primary_release_id: 1,
        copy_count: 1,
      },
    });

    expect(items.find((item) => item.release_id === 603)?.opportunity).toMatchObject({
      is_in_collection: true,
      collection_match: {
        primary_release_id: 3,
        copy_count: 2,
      },
    });
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
