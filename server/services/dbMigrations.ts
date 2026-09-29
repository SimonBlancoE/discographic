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

const COMMUNITY_COLUMNS: Array<[string, string]> = [
  ['master_id', 'INTEGER DEFAULT NULL'],
  ['community_have', 'INTEGER DEFAULT NULL'],
  ['community_want', 'INTEGER DEFAULT NULL'],
  ['community_rating', 'REAL DEFAULT NULL'],
  ['community_rating_count', 'INTEGER DEFAULT NULL'],
  ['num_for_sale', 'INTEGER DEFAULT NULL'],
];

/**
 * Adds Discogs community columns (have/want/rating, master release) and backfills them from
 * whatever `raw_json` already holds: collection items carry `basic_information.master_id`,
 * release details carry `master_id` and `community`.
 */
export function migrateCommunityColumns(db: Database.Database): void {
  const added = COMMUNITY_COLUMNS.filter(([name]) => !hasColumn(db, 'releases', name));
  for (const [name, definition] of added) {
    db.exec(`ALTER TABLE releases ADD COLUMN ${name} ${definition}`);
  }

  if (!added.length) {
    return;
  }

  db.exec(`
    UPDATE releases
    SET master_id = COALESCE(
          NULLIF(json_extract(raw_json, '$.basic_information.master_id'), 0),
          NULLIF(json_extract(raw_json, '$.master_id'), 0)
        ),
        community_have = json_extract(raw_json, '$.community.have'),
        community_want = json_extract(raw_json, '$.community.want'),
        community_rating = json_extract(raw_json, '$.community.rating.average'),
        community_rating_count = json_extract(raw_json, '$.community.rating.count'),
        num_for_sale = json_extract(raw_json, '$.num_for_sale')
    WHERE raw_json IS NOT NULL AND json_valid(raw_json)
  `);
}
