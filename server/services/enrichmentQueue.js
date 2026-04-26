import { RETRYABLE_MARKETPLACE_STATUSES } from '../../shared/contracts/marketplace.js';

const quotedStatuses = RETRYABLE_MARKETPLACE_STATUSES
  .map((status) => `'${status}'`)
  .join(', ');

export const ENRICH_CONDITION = `marketplace_status IN (${quotedStatuses})`;

export function getPendingEnrichmentCount(database, userId) {
  return database.prepare(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(userId).count;
}

export function getPendingEnrichmentRows(database, userId) {
  return database.prepare(`
    SELECT id, release_id
    FROM releases
    WHERE user_id = ? AND (${ENRICH_CONDITION})
    ORDER BY date_added DESC, id DESC
  `).all(userId);
}
