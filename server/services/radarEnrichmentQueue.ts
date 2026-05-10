import type Database from 'better-sqlite3';
import { RETRYABLE_MARKETPLACE_STATUSES } from '../../shared/contracts/marketplace.js';

type PendingEnrichmentCountRow = {
  count: number;
};

export type PendingRadarEnrichmentRow = {
  id: number;
  release_id: number;
};

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const quotedStatuses = RETRYABLE_MARKETPLACE_STATUSES
  .map(quoteSqlString)
  .join(', ');

export const RADAR_ENRICH_CONDITION = `marketplace_status IN (${quotedStatuses})`;

export function getPendingRadarEnrichmentCount(database: Database.Database, userId: number): number {
  return database.prepare<[number], PendingEnrichmentCountRow>(
    `SELECT COUNT(*) AS count FROM radar_releases WHERE user_id = ? AND (${RADAR_ENRICH_CONDITION})`
  ).get(userId)?.count ?? 0;
}

export function getPendingRadarEnrichmentRows(
  database: Database.Database,
  userId: number,
): PendingRadarEnrichmentRow[] {
  return database.prepare<[number], PendingRadarEnrichmentRow>(`
    SELECT id, release_id
    FROM radar_releases
    WHERE user_id = ? AND (${RADAR_ENRICH_CONDITION})
    ORDER BY date_added DESC, id DESC
  `).all(userId);
}
