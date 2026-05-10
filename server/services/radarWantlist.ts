import type Database from 'better-sqlite3';
import { RADAR_SOURCE_STATUS, type RadarSyncResult } from '../../shared/contracts/radar.js';

type UnknownRecord = Record<string, unknown>;

type DiscogsWantlistRow = {
  releaseId: number;
  title: string;
  artist: string;
  year: number | null;
  coverUrl: string | null;
  dateAdded: string | null;
};

type ExistingRadarRelease = {
  source_status: string | null;
};

type MappedWantlistRows = {
  rowsByReleaseId: Map<number, DiscogsWantlistRow>;
  ignored: number;
};

type InsertReleaseParams = [
  number,
  number,
  string,
  string,
  number | null,
  string | null,
  string | null,
  string,
  string,
];

type UpdateReleaseParams = [
  string,
  string,
  number | null,
  string | null,
  string | null,
  string,
  string,
  number,
  number,
];

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function artistNamesFromBasicInformation(basicInformation: UnknownRecord): string {
  return asArray(basicInformation.artists)
    .map((entry) => asText(asRecord(entry)?.name))
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function toWantlistRow(row: unknown): DiscogsWantlistRow | null {
  const source = asRecord(row) ?? {};
  const basicInformation = asRecord(source.basic_information) ?? {};
  const releaseId = asNumber(source.id) ?? asNumber(basicInformation.id);

  if (!releaseId) {
    return null;
  }

  const artist = artistNamesFromBasicInformation(basicInformation);

  return {
    releaseId,
    title: asText(basicInformation.title) ?? '-',
    artist: artist || '-',
    year: asNumber(basicInformation.year),
    coverUrl: asText(basicInformation.cover_image) ?? asText(basicInformation.thumb),
    dateAdded: asText(source.date_added),
  };
}

function mapWantlistRows(rows: unknown[]): MappedWantlistRows {
  const rowsByReleaseId = new Map<number, DiscogsWantlistRow>();
  let ignored = 0;

  for (const row of rows) {
    const mapped = toWantlistRow(row);

    if (!mapped) {
      ignored += 1;
      continue;
    }

    if (rowsByReleaseId.has(mapped.releaseId)) {
      ignored += 1;
    }

    rowsByReleaseId.set(mapped.releaseId, mapped);
  }

  return {
    rowsByReleaseId,
    ignored,
  };
}

function prepareSyncStatements(db: Database.Database) {
  return {
    selectExisting: db.prepare<[number, number], ExistingRadarRelease>(`
      SELECT source_status
      FROM radar_releases
      WHERE user_id = ? AND release_id = ?
    `),

    insertRelease: db.prepare<InsertReleaseParams>(`
      INSERT INTO radar_releases (
        user_id,
        release_id,
        title,
        artist,
        year,
        cover_url,
        date_added,
        source_discogs,
        source_status,
        source_last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `),

    updateRelease: db.prepare<UpdateReleaseParams>(`
      UPDATE radar_releases
      SET title = ?,
          artist = ?,
          year = ?,
          cover_url = ?,
          date_added = ?,
          source_discogs = 1,
          source_status = ?,
          source_last_seen_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND release_id = ?
    `),
  };
}

function upsertWantlistRows(
  statements: ReturnType<typeof prepareSyncStatements>,
  targetUserId: number,
  rowsByReleaseId: Map<number, DiscogsWantlistRow>,
  targetSyncedAt: string,
): Pick<RadarSyncResult, 'added' | 'updated' | 'reactivated'> {
  let added = 0;
  let updated = 0;
  let reactivated = 0;

  for (const mapped of rowsByReleaseId.values()) {
    const existing = statements.selectExisting.get(targetUserId, mapped.releaseId);

    if (!existing) {
      statements.insertRelease.run(
        targetUserId,
        mapped.releaseId,
        mapped.title,
        mapped.artist,
        mapped.year,
        mapped.coverUrl,
        mapped.dateAdded,
        RADAR_SOURCE_STATUS.ACTIVE,
        targetSyncedAt,
      );
      added += 1;
      continue;
    }

    statements.updateRelease.run(
      mapped.title,
      mapped.artist,
      mapped.year,
      mapped.coverUrl,
      mapped.dateAdded,
      RADAR_SOURCE_STATUS.ACTIVE,
      targetSyncedAt,
      targetUserId,
      mapped.releaseId,
    );

    if (existing.source_status === RADAR_SOURCE_STATUS.MISSING) {
      reactivated += 1;
    } else {
      updated += 1;
    }
  }

  return {
    added,
    updated,
    reactivated,
  };
}

function markMissingDiscogsRows(
  db: Database.Database,
  targetUserId: number,
  syncedReleaseIds: number[],
): number {
  if (syncedReleaseIds.length === 0) {
    return db.prepare<[string, number, string]>(`
      UPDATE radar_releases
      SET source_status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND source_discogs = 1
        AND source_status != ?
    `).run(
      RADAR_SOURCE_STATUS.MISSING,
      targetUserId,
      RADAR_SOURCE_STATUS.MISSING,
    ).changes;
  }

  const placeholders = syncedReleaseIds.map(() => '?').join(', ');

  return db.prepare<[string, number, string, ...number[]]>(`
    UPDATE radar_releases
    SET source_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND source_discogs = 1
      AND source_status != ?
      AND release_id NOT IN (${placeholders})
  `).run(
    RADAR_SOURCE_STATUS.MISSING,
    targetUserId,
    RADAR_SOURCE_STATUS.MISSING,
    ...syncedReleaseIds,
  ).changes;
}

export function syncRadarWantlist(
  db: Database.Database,
  userId: number,
  wantlistRows: unknown[],
  syncedAt = new Date().toISOString(),
): RadarSyncResult {
  const syncTx = db.transaction((
    targetUserId: number,
    rows: unknown[],
    targetSyncedAt: string,
  ): RadarSyncResult => {
    const { rowsByReleaseId, ignored } = mapWantlistRows(rows);
    const statements = prepareSyncStatements(db);
    const { added, updated, reactivated } = upsertWantlistRows(
      statements,
      targetUserId,
      rowsByReleaseId,
      targetSyncedAt,
    );
    const syncedReleaseIds = Array.from(rowsByReleaseId.keys());
    const markedMissing = markMissingDiscogsRows(db, targetUserId, syncedReleaseIds);

    return {
      totalFetched: rowsByReleaseId.size,
      added,
      updated,
      reactivated,
      markedMissing,
      ignored,
    };
  });

  return syncTx(userId, wantlistRows, syncedAt);
}
