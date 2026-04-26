import { MARKETPLACE_STATUS } from './marketplaceValue.js';

function hasColumn(db, tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function clearLegacyZeroEstimatedValues(db) {
  db.prepare(`
    UPDATE releases
    SET estimated_value = NULL
    WHERE estimated_value = 0
  `).run();
}

export function migrateMarketplaceStatus(db) {
  const justAdded = !hasColumn(db, 'releases', 'marketplace_status');
  if (justAdded) {
    db.exec(
      `ALTER TABLE releases ADD COLUMN marketplace_status TEXT DEFAULT '${MARKETPLACE_STATUS.PENDING}'`
    );
  }

  if (!justAdded) {
    db.prepare(`
      UPDATE releases
      SET marketplace_status = ?
      WHERE marketplace_status = 'ready'
    `).run(MARKETPLACE_STATUS.PRICED);
    clearLegacyZeroEstimatedValues(db);
    return;
  }

  db.prepare(`
    UPDATE releases
    SET marketplace_status = CASE
      WHEN estimated_value IS NOT NULL AND estimated_value > 0 THEN ?
      WHEN estimated_value = 0 THEN ?
      WHEN marketplace_status IS NULL OR marketplace_status = '' THEN ?
      ELSE marketplace_status
    END
  `).run(
    MARKETPLACE_STATUS.PRICED,
    MARKETPLACE_STATUS.PENDING,
    MARKETPLACE_STATUS.PENDING
  );

  clearLegacyZeroEstimatedValues(db);
}
