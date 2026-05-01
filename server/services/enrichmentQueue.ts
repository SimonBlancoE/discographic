import type Database from 'better-sqlite3';
import { RETRYABLE_MARKETPLACE_STATUSES } from '../../shared/contracts/marketplace.js';

type PendingEnrichmentCountRow = {
  count: number;
};

export type PendingEnrichmentRow = {
  id: number;
  release_id: number;
};

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const quotedStatuses = RETRYABLE_MARKETPLACE_STATUSES
  .map(quoteSqlString)
  .join(', ');

export const ENRICH_CONDITION = `marketplace_status IN (${quotedStatuses})`;

export function getPendingEnrichmentCount(database: Database.Database, userId: number): number {
  return database.prepare<[number], PendingEnrichmentCountRow>(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(userId)?.count ?? 0;
}

export function getPendingEnrichmentRows(database: Database.Database, userId: number): PendingEnrichmentRow[] {
  return database.prepare<[number], PendingEnrichmentRow>(`
    SELECT id, release_id
    FROM releases
    WHERE user_id = ? AND (${ENRICH_CONDITION})
    ORDER BY date_added DESC, id DESC
  `).all(userId);
}
