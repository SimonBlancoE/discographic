import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { applyRadarWantlistImport, buildRadarWantlistPreview, parseRadarWantlistWorkbook } from '../server/services/radarWantlistImport.js';
import { getRadarSnapshot, migrateRadarStorage } from '../server/services/radarStorage.js';
import {
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
} from '../shared/contracts/radar.js';

type Translate = (key: string) => string;

const messages: Record<string, string> = {
  'backend.radarImport.fileType': 'Unsupported file type.',
  'backend.radarImport.noSheets': 'The file does not contain any sheets.',
  'backend.radarImport.noRows': 'The file does not contain any data rows.',
  'backend.radarImport.fileRequired': 'No file was received.',
  'backend.radarImport.releaseIdColumnRequired': 'A release_id column is required.',
  'backend.radarImport.invalidReleaseId': 'Release ID must be a positive integer.',
  'backend.radarImport.invalidYear': 'Year must be a whole number.',
  'backend.radarImport.invalidDateAdded': 'Date added must be a valid date.',
  'backend.radarImport.invalidTargetPrice': 'Target price must be a valid number.',
  'backend.radarImport.invalidMinimumCondition': 'Minimum condition must be a supported Discogs grade.',
  'backend.radarImport.invalidPriority': 'Priority must be low, normal, or high.',
  'backend.radarImport.duplicateReleaseId': 'Release ID is duplicated in this file.',
};

const t: Translate = (key) => messages[key] ?? key;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-radar-wantlist-apply.db');

describe('Radar wantlist import apply', () => {
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
        date_added,
        local_priority,
        local_target_price_eur,
        local_minimum_condition,
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
      'API Title',
      'API Artist',
      1998,
      '2024-01-01',
      RADAR_PRIORITY.HIGH,
      20,
      RADAR_MINIMUM_CONDITION.NEAR_MINT,
      'Keep hidden',
      1,
      0,
      1,
      0,
      RADAR_SOURCE_STATUS.ACTIVE,
      '2026-05-10T09:00:00Z',
      MARKETPLACE_STATUS.PRICED,
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('applies valid preview rows into Radar, skips duplicate and invalid rows, and preserves non-file fields unless explicitly updated', () => {
    const csv = [
      'release_id,artist,title,year,notes,date_added,target_price,minimum_condition,priority',
      '111,Changed Artist,Changed Title,2005,Imported note,2026-05-09,18.5,,',
      '111,Duplicate Artist,Duplicate Title,2006,Duplicate note,2026-05-08,17,NM,low',
      '222,Invalid Condition,Should Skip,2010,Nope,2026-05-07,15,BAD,normal',
      '333,File Artist,File Title,1981,Need clean copy,2026-05-10,19.75,VG+,alta',
    ].join('\n');

    const preview = buildRadarWantlistPreview(parseRadarWantlistWorkbook(Buffer.from(csv), 'wantlist.csv', t), t);

    expect(preview.summary).toEqual({
      totalRows: 4,
      validRows: 2,
      invalidRows: 2,
    });
    expect(preview.errors).toEqual([
      {
        row: 3,
        column: 'release_id',
        value: '111',
        reason: messages['backend.radarImport.duplicateReleaseId'],
      },
      {
        row: 4,
        column: 'minimum_condition',
        value: 'BAD',
        reason: messages['backend.radarImport.invalidMinimumCondition'],
      },
    ]);

    const result = applyRadarWantlistImport(db, 7, preview.rows.map((row) => ({
      ...row,
      target_price_eur: row.target_price,
    })), '2026-05-10T12:00:00Z');

    expect(result).toEqual({
      totalRows: 2,
      imported: 2,
      skipped: 0,
      added: 1,
      updated: 1,
    });

    const snapshot = getRadarSnapshot(db, 7);
    expect(snapshot.items).toHaveLength(2);

    const merged = snapshot.items.find((item) => item.release_id === 111);
    expect(merged).toMatchObject({
      title: 'API Title',
      artist: 'API Artist',
      year: 1998,
      date_added: '2026-05-09',
      local: {
        priority: RADAR_PRIORITY.HIGH,
        target_price_eur: 18.5,
        minimum_condition: RADAR_MINIMUM_CONDITION.NEAR_MINT,
        note: 'Imported note',
        hidden: true,
        resolved: false,
      },
      source: {
        origin: RADAR_SOURCE_ORIGIN.BOTH,
        status: RADAR_SOURCE_STATUS.ACTIVE,
        last_seen_at: '2026-05-10T12:00:00Z',
      },
    });

    const added = snapshot.items.find((item) => item.release_id === 333);
    expect(added).toMatchObject({
      title: 'File Title',
      artist: 'File Artist',
      year: 1981,
      date_added: '2026-05-10',
      local: {
        priority: RADAR_PRIORITY.HIGH,
        target_price_eur: 19.75,
        minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
        note: 'Need clean copy',
        hidden: false,
        resolved: false,
      },
      source: {
        origin: RADAR_SOURCE_ORIGIN.FILE,
        status: RADAR_SOURCE_STATUS.ACTIVE,
        last_seen_at: '2026-05-10T12:00:00Z',
      },
    });
  });
});
