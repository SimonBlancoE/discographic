import type Database from 'better-sqlite3';
import { MARKETPLACE_STATUS } from '../../shared/contracts/marketplace.js';

type TableColumn = {
  name: string;
};

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare<[], TableColumn>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function clearLegacyZeroEstimatedValues(db: Database.Database): void {
  db.prepare(`
    UPDATE releases
    SET estimated_value = NULL
    WHERE estimated_value = 0
  `).run();
}

export function migrateMarketplaceStatus(db: Database.Database): void {
  const marketplaceStatusWasMissing = !hasColumn(db, 'releases', 'marketplace_status');
  if (marketplaceStatusWasMissing) {
    db.exec(
      `ALTER TABLE releases ADD COLUMN marketplace_status TEXT DEFAULT '${MARKETPLACE_STATUS.PENDING}'`
    );
  }

  if (!marketplaceStatusWasMissing) {
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
