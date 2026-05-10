import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getRadarSnapshot, migrateRadarStorage } from '../server/services/radarStorage.js';
import { syncRadarWantlist } from '../server/services/radarWantlist.js';
import {
  MARKETPLACE_STATUS,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
} from '../shared/contracts/radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-radar-sync.db');

describe('Radar wantlist sync', () => {
  let db: Database.Database;

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    migrateRadarStorage(db);

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        year,
        cover_url,
        date_added,
        local_priority,
        local_target_price_eur,
        local_note,
        local_hidden,
        local_resolved,
        source_discogs,
        source_file,
        source_status,
        source_last_seen_at,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      111,
      'Old Missing Title',
      'Old Artist',
      1998,
      'https://img.example/missing-old.jpg',
      '2024-01-01T00:00:00Z',
      RADAR_PRIORITY.HIGH,
      22.5,
      'Keep this note',
      1,
      0,
      1,
      0,
      RADAR_SOURCE_STATUS.MISSING,
      '2024-01-01T00:00:00Z',
      MARKETPLACE_STATUS.PRICED,
    );

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        local_note,
        local_resolved,
        source_discogs,
        source_file,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      222,
      'Will Go Missing',
      'Artist Missing',
      'still local',
      0,
      1,
      0,
      RADAR_SOURCE_STATUS.ACTIVE,
      MARKETPLACE_STATUS.PENDING,
    );

    db.prepare(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        local_note,
        local_resolved,
        source_discogs,
        source_file,
        source_status,
        marketplace_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      7,
      333,
      'File Seed Title',
      'File Seed Artist',
      'from file only',
      1,
      0,
      1,
      RADAR_SOURCE_STATUS.ACTIVE,
      MARKETPLACE_STATUS.FAILED,
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('merges wantlist rows by release id, preserves local decisions, reactivates reappearing rows, and marks missing releases', () => {
    const result = syncRadarWantlist(db, 7, [
      {
        id: 111,
        basic_information: {
          id: 111,
          title: 'Reappeared Title',
          year: 2001,
          cover_image: 'https://img.example/reappeared.jpg',
          artists: [{ name: 'Recovered Artist' }],
        },
        date_added: '2026-05-10T10:00:00Z',
      },
      {
        basic_information: {
          id: 333,
          title: 'Now On Discogs Too',
          year: 2012,
          thumb: 'https://img.example/both.jpg',
          artists: [{ name: 'Joint Source Artist' }],
        },
        date_added: '2026-05-10T10:01:00Z',
      },
      {
        id: 444,
        basic_information: {
          id: 444,
          title: 'Fresh Want',
          year: 2019,
          cover_image: 'https://img.example/fresh.jpg',
          artists: [{ name: 'New Artist' }],
        },
        date_added: '2026-05-10T10:02:00Z',
      },
      {
        basic_information: {
          title: 'Ignored Missing Release Id',
        },
      },
    ], '2026-05-10T12:00:00Z');

    expect(result).toEqual({
      totalFetched: 3,
      added: 1,
      updated: 1,
      reactivated: 1,
      markedMissing: 1,
      ignored: 1,
    });

    const snapshot = getRadarSnapshot(db, 7);
    expect(snapshot.items).toHaveLength(4);

    const reappeared = snapshot.items.find((item) => item.release_id === 111);
    expect(reappeared).toMatchObject({
      title: 'Reappeared Title',
      artist: 'Recovered Artist',
      year: 2001,
      cover_url: 'https://img.example/reappeared.jpg',
      date_added: '2026-05-10T10:00:00Z',
      local: {
        priority: RADAR_PRIORITY.HIGH,
        target_price_eur: 22.5,
        note: 'Keep this note',
        hidden: true,
      },
      source: {
        origin: RADAR_SOURCE_ORIGIN.DISCOGS,
        status: RADAR_SOURCE_STATUS.ACTIVE,
        last_seen_at: '2026-05-10T12:00:00Z',
      },
    });

    const nowMissing = snapshot.items.find((item) => item.release_id === 222);
    expect(nowMissing?.source.status).toBe(RADAR_SOURCE_STATUS.MISSING);
    expect(nowMissing?.local.note).toBe('still local');

    const bothSources = snapshot.items.find((item) => item.release_id === 333);
    expect(bothSources).toMatchObject({
      title: 'Now On Discogs Too',
      artist: 'Joint Source Artist',
      local: {
        note: 'from file only',
        resolved: true,
      },
      source: {
        origin: RADAR_SOURCE_ORIGIN.BOTH,
        status: RADAR_SOURCE_STATUS.ACTIVE,
      },
    });

    const fresh = snapshot.items.find((item) => item.release_id === 444);
    expect(fresh).toMatchObject({
      title: 'Fresh Want',
      artist: 'New Artist',
      source: {
        origin: RADAR_SOURCE_ORIGIN.DISCOGS,
        status: RADAR_SOURCE_STATUS.ACTIVE,
      },
    });
  });
});
