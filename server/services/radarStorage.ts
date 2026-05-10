import type Database from 'better-sqlite3';
import {
  MARKETPLACE_STATUS,
  normalizeRadarResponse,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
  type RadarLocalDecisionUpdate,
  type RadarPriority,
  type RadarResponse,
  type RadarSourceOrigin,
} from '../../shared/contracts/radar.js';

type TableColumn = {
  name: string;
};

type RadarColumnDefinition = {
  name: string;
  sqlType: string;
};

type RadarRow = {
  id: number;
  user_id: number;
  release_id: number;
  title: string;
  artist: string;
  year: number | null;
  cover_url: string | null;
  date_added: string | null;
  local_priority: string | null;
  local_target_price_eur: number | null;
  local_minimum_condition: string | null;
  local_note: string | null;
  local_hidden: number | null;
  local_resolved: number | null;
  source_discogs: number | null;
  source_file: number | null;
  source_status: string | null;
  source_last_seen_at: string | null;
  marketplace_status: string | null;
  estimated_price: number | null;
  listing_status: string | null;
  listing_price: number | null;
  listing_currency: string | null;
  listing_price_eur: number | null;
  marketplace_last_checked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RadarSummaryParams = {
  userId: number;
  missingStatus: string;
  pricedStatus: string;
  pendingStatus: string;
  failedStatus: string;
  unavailableStatus: string;
};

type RadarSummaryRow = Record<keyof RadarResponse['summary'], number | null>;

type StoredRadarLocalDecisionUpdate = RadarLocalDecisionUpdate & {
  userId: number;
  radarId: number;
};

const RADAR_TABLE = 'radar_releases';

const RADAR_COLUMN_DEFINITIONS: RadarColumnDefinition[] = [
  { name: 'year', sqlType: 'INTEGER DEFAULT NULL' },
  { name: 'cover_url', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'date_added', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'local_priority', sqlType: `TEXT NOT NULL DEFAULT '${RADAR_PRIORITY.NORMAL}'` },
  { name: 'local_target_price_eur', sqlType: 'REAL DEFAULT NULL' },
  { name: 'local_minimum_condition', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'local_note', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'local_hidden', sqlType: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'local_resolved', sqlType: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'source_discogs', sqlType: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'source_file', sqlType: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'source_status', sqlType: `TEXT NOT NULL DEFAULT '${RADAR_SOURCE_STATUS.ACTIVE}'` },
  { name: 'source_last_seen_at', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'marketplace_status', sqlType: `TEXT NOT NULL DEFAULT '${MARKETPLACE_STATUS.PENDING}'` },
  { name: 'estimated_price', sqlType: 'REAL DEFAULT NULL' },
  { name: 'listing_status', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'listing_price', sqlType: 'REAL DEFAULT NULL' },
  { name: 'listing_currency', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'listing_price_eur', sqlType: 'REAL DEFAULT NULL' },
  { name: 'marketplace_last_checked_at', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'created_at', sqlType: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { name: 'updated_at', sqlType: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
];

const RADAR_SELECT_COLUMNS = [
  'id',
  'user_id',
  'release_id',
  'title',
  'artist',
  'year',
  'cover_url',
  'date_added',
  'local_priority',
  'local_target_price_eur',
  'local_minimum_condition',
  'local_note',
  'local_hidden',
  'local_resolved',
  'source_discogs',
  'source_file',
  'source_status',
  'source_last_seen_at',
  'marketplace_status',
  'estimated_price',
  'listing_status',
  'listing_price',
  'listing_currency',
  'listing_price_eur',
  'marketplace_last_checked_at',
  'created_at',
  'updated_at',
].join(',\n      ');

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare<[], TableColumn>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  sqlType: string,
): void {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
  }
}

function deriveSourceOrigin(sourceDiscogs: number | null, sourceFile: number | null): RadarSourceOrigin {
  const hasDiscogs = sourceDiscogs === 1;
  const hasFile = sourceFile === 1;

  if (hasDiscogs && hasFile) {
    return RADAR_SOURCE_ORIGIN.BOTH;
  }

  if (hasDiscogs) {
    return RADAR_SOURCE_ORIGIN.DISCOGS;
  }

  if (hasFile) {
    return RADAR_SOURCE_ORIGIN.FILE;
  }

  return RADAR_SOURCE_ORIGIN.NONE;
}

function toRadarItem(row: RadarRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    release_id: row.release_id,
    title: row.title,
    artist: row.artist,
    year: row.year,
    cover_url: row.cover_url,
    date_added: row.date_added,
    local: {
      priority: row.local_priority,
      target_price_eur: row.local_target_price_eur,
      minimum_condition: row.local_minimum_condition,
      note: row.local_note ?? '',
      hidden: row.local_hidden,
      resolved: row.local_resolved,
    },
    source: {
      origin: deriveSourceOrigin(row.source_discogs, row.source_file),
      status: row.source_status,
      last_seen_at: row.source_last_seen_at,
    },
    marketplace: {
      status: row.marketplace_status,
      estimated_price: row.estimated_price,
      listing_status: row.listing_status,
      listing_price: row.listing_price,
      listing_currency: row.listing_currency,
      listing_price_eur: row.listing_price_eur,
      last_checked_at: row.marketplace_last_checked_at,
    },
    timestamps: {
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

function normalizeLegacyMarketplaceStatus(db: Database.Database): void {
  db.prepare(`
    UPDATE ${RADAR_TABLE}
    SET marketplace_status = ?
    WHERE marketplace_status = 'ready'
  `).run(MARKETPLACE_STATUS.PRICED);
}

export function migrateRadarStorage(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${RADAR_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      release_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      year INTEGER DEFAULT NULL,
      cover_url TEXT DEFAULT NULL,
      date_added TEXT DEFAULT NULL,
      local_priority TEXT NOT NULL DEFAULT '${RADAR_PRIORITY.NORMAL}',
      local_target_price_eur REAL DEFAULT NULL,
      local_minimum_condition TEXT DEFAULT NULL,
      local_note TEXT DEFAULT NULL,
      local_hidden INTEGER NOT NULL DEFAULT 0,
      local_resolved INTEGER NOT NULL DEFAULT 0,
      source_discogs INTEGER NOT NULL DEFAULT 0,
      source_file INTEGER NOT NULL DEFAULT 0,
      source_status TEXT NOT NULL DEFAULT '${RADAR_SOURCE_STATUS.ACTIVE}',
      source_last_seen_at TEXT DEFAULT NULL,
      marketplace_status TEXT NOT NULL DEFAULT '${MARKETPLACE_STATUS.PENDING}',
      estimated_price REAL DEFAULT NULL,
      listing_status TEXT DEFAULT NULL,
      listing_price REAL DEFAULT NULL,
      listing_currency TEXT DEFAULT NULL,
      listing_price_eur REAL DEFAULT NULL,
      marketplace_last_checked_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const column of RADAR_COLUMN_DEFINITIONS) {
    addColumnIfMissing(db, RADAR_TABLE, column.name, column.sqlType);
  }

  normalizeLegacyMarketplaceStatus(db);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_releases_user_release
    ON ${RADAR_TABLE}(user_id, release_id);

    CREATE INDEX IF NOT EXISTS idx_radar_releases_user_status
    ON ${RADAR_TABLE}(user_id, source_status, marketplace_status);
  `);
}

export function clearRadarRows(db: Database.Database, userId: number): void {
  db.prepare(`DELETE FROM ${RADAR_TABLE} WHERE user_id = ?`).run(userId);
}

export function updateRadarLocalDecision(
  db: Database.Database,
  {
    userId,
    radarId,
    priority,
    targetPriceEur,
    minimumCondition,
    note,
    hidden,
    resolved,
  }: StoredRadarLocalDecisionUpdate,
): boolean {
  const normalizedPriority = Object.values(RADAR_PRIORITY).includes(priority)
    ? priority
    : RADAR_PRIORITY.NORMAL;
  const normalizedTargetPriceEur =
    targetPriceEur == null || !Number.isFinite(targetPriceEur) ? null : Number(targetPriceEur.toFixed(2));
  const normalizedMinimumCondition = minimumCondition != null
    && Object.values(RADAR_MINIMUM_CONDITION).includes(minimumCondition)
    ? minimumCondition
    : null;
  const normalizedNote = typeof note === 'string' && note.trim() ? note.trim() : '';

  const result = db.prepare(`
    UPDATE ${RADAR_TABLE}
    SET local_priority = @priority,
        local_target_price_eur = @targetPriceEur,
        local_minimum_condition = @minimumCondition,
        local_note = @note,
        local_hidden = @hidden,
        local_resolved = @resolved,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @radarId AND user_id = @userId
  `).run({
    userId,
    radarId,
    priority: normalizedPriority,
    targetPriceEur: normalizedTargetPriceEur,
    minimumCondition: normalizedMinimumCondition,
    note: normalizedNote,
    hidden: hidden ? 1 : 0,
    resolved: resolved ? 1 : 0,
  });

  return result.changes > 0;
}

export function getRadarSnapshot(db: Database.Database, userId: number): RadarResponse {
  const rows = db.prepare<[{ userId: number }], RadarRow>(`
    SELECT
      ${RADAR_SELECT_COLUMNS}
    FROM ${RADAR_TABLE}
    WHERE user_id = @userId
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
  `).all({ userId });

  const summary = db.prepare<
    [RadarSummaryParams],
    RadarSummaryRow
  >(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE
        WHEN local_hidden = 0 AND local_resolved = 0 AND source_status != @missingStatus THEN 1
        ELSE 0
      END) AS active,
      SUM(CASE WHEN local_hidden = 1 THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN local_resolved = 1 THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN source_status = @missingStatus THEN 1 ELSE 0 END) AS missingFromSource,
      SUM(CASE WHEN marketplace_status = @pricedStatus THEN 1 ELSE 0 END) AS priced,
      SUM(CASE WHEN marketplace_status = @pendingStatus THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN marketplace_status = @failedStatus THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN marketplace_status = @unavailableStatus THEN 1 ELSE 0 END) AS unavailable
    FROM ${RADAR_TABLE}
    WHERE user_id = @userId
  `).get({
    userId,
    missingStatus: RADAR_SOURCE_STATUS.MISSING,
    pricedStatus: MARKETPLACE_STATUS.PRICED,
    pendingStatus: MARKETPLACE_STATUS.PENDING,
    failedStatus: MARKETPLACE_STATUS.FAILED,
    unavailableStatus: MARKETPLACE_STATUS.UNAVAILABLE,
  });

  return normalizeRadarResponse({
    items: rows.map(toRadarItem),
    summary,
  });
}
