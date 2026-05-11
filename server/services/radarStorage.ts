import type Database from 'better-sqlite3';
import {
  MARKETPLACE_STATUS,
  normalizeRadarResponse,
  RADAR_OPPORTUNITY_REASON,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
  type RadarLocalDecisionUpdate,
  type RadarCollectionMatch,
  type RadarOpportunityReason,
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
  marketplace_last_checked_at: string | null;
  marketplace_last_unavailable_at: string | null;
  marketplace_available_again_at: string | null;
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

type RadarAvailabilityTransition = {
  markUnavailableNow: boolean;
  markAvailableAgainNow: boolean;
  clearAvailableAgain: boolean;
};

type CollectionMatchRow = RadarCollectionMatch & {
  release_id: number;
};

const RADAR_TABLE = 'radar_releases';
const HIDDEN_OR_INACTIVE_SORT_BUCKET = 99;
const INCOMPLETE_MARKETPLACE_SORT_BUCKET = 4;
const DEFAULT_SORT_BUCKET = 5;

const RADAR_BASE_COLUMN_DEFINITIONS: RadarColumnDefinition[] = [
  { name: 'id', sqlType: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
  { name: 'user_id', sqlType: 'INTEGER NOT NULL' },
  { name: 'release_id', sqlType: 'INTEGER NOT NULL' },
  { name: 'title', sqlType: 'TEXT NOT NULL' },
  { name: 'artist', sqlType: 'TEXT NOT NULL' },
];

const RADAR_MIGRATED_COLUMN_DEFINITIONS: RadarColumnDefinition[] = [
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
  { name: 'marketplace_last_checked_at', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'marketplace_last_unavailable_at', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'marketplace_available_again_at', sqlType: 'TEXT DEFAULT NULL' },
  { name: 'created_at', sqlType: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { name: 'updated_at', sqlType: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
];

const RADAR_COLUMN_DEFINITIONS = [
  ...RADAR_BASE_COLUMN_DEFINITIONS,
  ...RADAR_MIGRATED_COLUMN_DEFINITIONS,
];

const RADAR_CREATE_COLUMNS = RADAR_COLUMN_DEFINITIONS
  .map(({ name, sqlType }) => `${name} ${sqlType}`)
  .join(',\n      ');

const RADAR_SELECT_COLUMNS = RADAR_COLUMN_DEFINITIONS
  .map(({ name }) => name)
  .join(',\n      ');

const OPPORTUNITY_REASON_SORT_BUCKETS: Array<{ reason: RadarOpportunityReason; bucket: number }> = [
  { reason: RADAR_OPPORTUNITY_REASON.BELOW_TARGET, bucket: 0 },
  { reason: RADAR_OPPORTUNITY_REASON.HIGH_PRIORITY_AVAILABLE, bucket: 1 },
  { reason: RADAR_OPPORTUNITY_REASON.AVAILABLE_AGAIN, bucket: 2 },
  { reason: RADAR_OPPORTUNITY_REASON.ALREADY_IN_COLLECTION, bucket: 3 },
];

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare<[], TableColumn>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return Boolean(
    db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', tableName),
  );
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

function hasAvailableMarketplacePrice(row: RadarRow): boolean {
  return row.marketplace_status === MARKETPLACE_STATUS.PRICED
    && Number.isFinite(row.estimated_price)
    && (row.estimated_price ?? 0) > 0;
}

function isBelowTarget(row: RadarRow): boolean {
  return hasAvailableMarketplacePrice(row)
    && Number.isFinite(row.local_target_price_eur)
    && row.local_target_price_eur != null
    && row.estimated_price != null
    && row.estimated_price < row.local_target_price_eur;
}

function isAvailableAgain(row: RadarRow): boolean {
  return hasAvailableMarketplacePrice(row) && typeof row.marketplace_available_again_at === 'string';
}

function getOpportunityReasons(
  row: RadarRow,
  isInCollection: boolean,
): RadarOpportunityReason[] {
  const reasons: RadarOpportunityReason[] = [];

  if (isBelowTarget(row)) {
    reasons.push(RADAR_OPPORTUNITY_REASON.BELOW_TARGET);
  }

  if (row.local_priority === RADAR_PRIORITY.HIGH && hasAvailableMarketplacePrice(row)) {
    reasons.push(RADAR_OPPORTUNITY_REASON.HIGH_PRIORITY_AVAILABLE);
  }

  if (isAvailableAgain(row)) {
    reasons.push(RADAR_OPPORTUNITY_REASON.AVAILABLE_AGAIN);
  }

  if (isInCollection) {
    reasons.push(RADAR_OPPORTUNITY_REASON.ALREADY_IN_COLLECTION);
  }

  return reasons;
}

function isDefaultVisible(row: RadarRow): boolean {
  return row.local_hidden !== 1
    && row.local_resolved !== 1
    && row.source_status !== RADAR_SOURCE_STATUS.MISSING;
}

function hasIncompleteMarketplaceStatus(row: RadarRow): boolean {
  return row.marketplace_status === MARKETPLACE_STATUS.PENDING
    || row.marketplace_status === MARKETPLACE_STATUS.FAILED
    || row.marketplace_status === MARKETPLACE_STATUS.UNAVAILABLE;
}

function getOpportunityReasonSortBucket(reasons: RadarOpportunityReason[]): number | null {
  for (const { reason, bucket } of OPPORTUNITY_REASON_SORT_BUCKETS) {
    if (reasons.includes(reason)) {
      return bucket;
    }
  }

  return null;
}

function getSortBucket(row: RadarRow, reasons: RadarOpportunityReason[], defaultVisible: boolean): number {
  if (!defaultVisible) {
    return HIDDEN_OR_INACTIVE_SORT_BUCKET;
  }

  const reasonBucket = getOpportunityReasonSortBucket(reasons);
  if (reasonBucket != null) {
    return reasonBucket;
  }

  if (hasIncompleteMarketplaceStatus(row)) {
    return INCOMPLETE_MARKETPLACE_SORT_BUCKET;
  }

  return DEFAULT_SORT_BUCKET;
}

function getPriorityRank(priority: string | null): number {
  switch (priority) {
    case RADAR_PRIORITY.HIGH:
      return 0;
    case RADAR_PRIORITY.LOW:
      return 2;
    case RADAR_PRIORITY.NORMAL:
    default:
      return 1;
  }
}

function getTimestampRank(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRadarItem(row: RadarRow, collectionMatches: ReadonlyMap<number, RadarCollectionMatch>) {
  const collectionMatch = collectionMatches.get(row.release_id) ?? null;
  const isInCollection = collectionMatch != null;
  const reasons = getOpportunityReasons(row, isInCollection);
  const defaultVisible = isDefaultVisible(row);

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
      last_checked_at: row.marketplace_last_checked_at,
    },
    timestamps: {
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    opportunity: {
      reasons,
      default_visible: defaultVisible,
      is_in_collection: isInCollection,
      collection_match: collectionMatch,
    },
  };
}

type RadarItem = ReturnType<typeof toRadarItem>;

type SortableRadarItem = {
  item: RadarItem;
  bucket: number;
  priority: number;
  dateRank: number;
};

function getCollectionMatches(db: Database.Database, userId: number): Map<number, RadarCollectionMatch> {
  if (!tableExists(db, 'releases')) {
    return new Map<number, RadarCollectionMatch>();
  }

  const primaryReleaseOrderClause = hasColumn(db, 'releases', 'date_added')
    ? `
        CASE WHEN r2.date_added IS NULL OR r2.date_added = '' THEN 1 ELSE 0 END ASC,
        r2.date_added DESC,
        r2.id DESC
      `
    : 'r2.id DESC';

  const rows = db.prepare<[{ userId: number }], CollectionMatchRow>(`
    SELECT
      r.release_id,
      COUNT(*) AS copy_count,
      (
        SELECT r2.id
        FROM releases r2
        WHERE r2.user_id = @userId
          AND r2.release_id = r.release_id
        ORDER BY ${primaryReleaseOrderClause}
        LIMIT 1
      ) AS primary_release_id
    FROM releases AS r
    WHERE r.user_id = @userId
    GROUP BY r.release_id
  `).all({ userId });

  return new Map(rows.map((row) => [
    row.release_id,
    {
      primary_release_id: row.primary_release_id,
      copy_count: row.copy_count,
    },
  ]));
}

function toSortableRadarItem(
  row: RadarRow,
  collectionMatches: ReadonlyMap<number, RadarCollectionMatch>,
): SortableRadarItem {
  const item = toRadarItem(row, collectionMatches);

  return {
    item,
    bucket: getSortBucket(row, item.opportunity.reasons, item.opportunity.default_visible),
    priority: getPriorityRank(row.local_priority),
    dateRank: getTimestampRank(item.date_added ?? item.timestamps.updated_at ?? item.timestamps.created_at),
  };
}

function compareSortableRadarItems(left: SortableRadarItem, right: SortableRadarItem): number {
  if (left.bucket !== right.bucket) {
    return left.bucket - right.bucket;
  }

  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  if (left.dateRank !== right.dateRank) {
    return right.dateRank - left.dateRank;
  }

  return (right.item.id ?? 0) - (left.item.id ?? 0);
}

function normalizeLegacyMarketplaceStatus(db: Database.Database): void {
  db.prepare(`
    UPDATE ${RADAR_TABLE}
    SET marketplace_status = ?
    WHERE marketplace_status = 'ready'
  `).run(MARKETPLACE_STATUS.PRICED);
}

export function getRadarAvailabilityTransition(
  previousStatus: string | null,
  nextStatus: string,
): RadarAvailabilityTransition {
  const nextUnavailable = nextStatus === MARKETPLACE_STATUS.UNAVAILABLE;
  const nextPriced = nextStatus === MARKETPLACE_STATUS.PRICED;
  const wasUnavailable = previousStatus === MARKETPLACE_STATUS.UNAVAILABLE;

  return {
    markUnavailableNow: nextUnavailable,
    markAvailableAgainNow: wasUnavailable && nextPriced,
    clearAvailableAgain: nextUnavailable,
  };
}

export function migrateRadarStorage(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${RADAR_TABLE} (
      ${RADAR_CREATE_COLUMNS}
    )
  `);

  for (const column of RADAR_MIGRATED_COLUMN_DEFINITIONS) {
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
  const collectionMatches = getCollectionMatches(db, userId);

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
  const items = rows
    .map((row) => toSortableRadarItem(row, collectionMatches))
    .sort(compareSortableRadarItems)
    .map(({ item }) => item);

  return normalizeRadarResponse({
    items,
    summary,
  });
}
