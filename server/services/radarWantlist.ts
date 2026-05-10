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

function mapWantlistRow(row: unknown): DiscogsWantlistRow | null {
  const source = asRecord(row) ?? {};
  const basicInformation = asRecord(source.basic_information) ?? {};
  const releaseId = asNumber(source.id) ?? asNumber(basicInformation.id);

  if (!releaseId) {
    return null;
  }

  const artist = asArray(basicInformation.artists)
    .map((entry) => asText(asRecord(entry)?.name))
    .filter((value): value is string => Boolean(value))
    .join(', ');

  return {
    releaseId,
    title: asText(basicInformation.title) ?? '-',
    artist: artist || '-',
    year: asNumber(basicInformation.year),
    coverUrl: asText(basicInformation.cover_image) ?? asText(basicInformation.thumb),
    dateAdded: asText(source.date_added),
  };
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
    const mappedRows = new Map<number, DiscogsWantlistRow>();
    let ignored = 0;

    for (const row of rows) {
      const mapped = mapWantlistRow(row);

      if (!mapped) {
        ignored += 1;
        continue;
      }

      if (mappedRows.has(mapped.releaseId)) {
        ignored += 1;
      }

      mappedRows.set(mapped.releaseId, mapped);
    }

    const selectExisting = db.prepare<[number, number], { source_status: string | null }>(`
      SELECT source_status
      FROM radar_releases
      WHERE user_id = ? AND release_id = ?
    `);

    const insertRelease = db.prepare(`
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
    `);

    const updateRelease = db.prepare(`
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
    `);

    let added = 0;
    let updated = 0;
    let reactivated = 0;

    for (const mapped of mappedRows.values()) {
      const existing = selectExisting.get(targetUserId, mapped.releaseId);

      if (!existing) {
        insertRelease.run(
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

      updateRelease.run(
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

    let markedMissing = 0;

    if (mappedRows.size > 0) {
      const releaseIds = Array.from(mappedRows.keys());
      const placeholders = releaseIds.map(() => '?').join(', ');
      const updateMissing = db.prepare(`
        UPDATE radar_releases
        SET source_status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND source_discogs = 1
          AND source_status != ?
          AND release_id NOT IN (${placeholders})
      `);

      markedMissing = updateMissing.run(
        RADAR_SOURCE_STATUS.MISSING,
        targetUserId,
        RADAR_SOURCE_STATUS.MISSING,
        ...releaseIds,
      ).changes;
    } else {
      markedMissing = db.prepare(`
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

    return {
      totalFetched: mappedRows.size,
      added,
      updated,
      reactivated,
      markedMissing,
      ignored,
    };
  });

  return syncTx(userId, wantlistRows, syncedAt);
}
