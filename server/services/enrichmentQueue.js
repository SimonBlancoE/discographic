export const ENRICH_CONDITION = "estimated_value IS NULL";

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
