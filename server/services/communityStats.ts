import type Database from 'better-sqlite3';

export type CommunityUpdate = {
  master_id: number | null;
  community_have: number | null;
  community_want: number | null;
  community_rating: number | null;
  community_rating_count: number | null;
  num_for_sale: number | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asCount(value: unknown): number | null {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function asRating(value: unknown): number | null {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Extracts the community demand fields from a Discogs `/releases/{id}` payload. */
export function buildCommunityUpdate(detail: unknown): CommunityUpdate {
  const source = asRecord(detail);
  const community = asRecord(source?.community);
  const rating = asRecord(community?.rating);
  const masterId = asCount(source?.master_id);

  return {
    master_id: masterId && masterId > 0 ? masterId : null,
    community_have: asCount(community?.have),
    community_want: asCount(community?.want),
    community_rating: asRating(rating?.average),
    community_rating_count: asCount(rating?.count),
    num_for_sale: asCount(source?.num_for_sale),
  };
}

export function getCommunityBackfillCount(database: Database.Database, userId: number): number {
  return database.prepare<[number], { count: number }>(
    'SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND community_have IS NULL'
  ).get(userId)?.count ?? 0;
}

export function getCommunityBackfillRows(database: Database.Database, userId: number): Array<{ id: number; release_id: number }> {
  return database.prepare<[number], { id: number; release_id: number }>(`
    SELECT id, release_id
    FROM releases
    WHERE user_id = ? AND community_have IS NULL
    ORDER BY date_added DESC, id DESC
  `).all(userId);
}
