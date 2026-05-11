import { MARKETPLACE_STATUS, type MarketplaceStatus } from './marketplace.js';

type UnknownRecord = Record<string, unknown>;

export const RADAR_PRIORITY = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
} as const);
export type RadarPriority = (typeof RADAR_PRIORITY)[keyof typeof RADAR_PRIORITY];

export const RADAR_MINIMUM_CONDITION = Object.freeze({
  MINT: 'M',
  NEAR_MINT: 'NM',
  VERY_GOOD_PLUS: 'VG+',
  VERY_GOOD: 'VG',
  GOOD_PLUS: 'G+',
  GOOD: 'G',
  FAIR: 'F',
  POOR: 'P',
} as const);
export type RadarMinimumCondition =
  (typeof RADAR_MINIMUM_CONDITION)[keyof typeof RADAR_MINIMUM_CONDITION];

export const RADAR_SOURCE_ORIGIN = Object.freeze({
  NONE: 'none',
  DISCOGS: 'discogs',
  FILE: 'file',
  BOTH: 'both',
} as const);
export type RadarSourceOrigin = (typeof RADAR_SOURCE_ORIGIN)[keyof typeof RADAR_SOURCE_ORIGIN];

export const RADAR_SOURCE_STATUS = Object.freeze({
  ACTIVE: 'active',
  MISSING: 'missing',
} as const);
export type RadarSourceStatus = (typeof RADAR_SOURCE_STATUS)[keyof typeof RADAR_SOURCE_STATUS];

export const RADAR_OPPORTUNITY_REASON = Object.freeze({
  BELOW_TARGET: 'below_target',
  HIGH_PRIORITY_AVAILABLE: 'high_priority_available',
  AVAILABLE_AGAIN: 'available_again',
  ALREADY_IN_COLLECTION: 'already_in_collection',
} as const);
export type RadarOpportunityReason =
  (typeof RADAR_OPPORTUNITY_REASON)[keyof typeof RADAR_OPPORTUNITY_REASON];

export type RadarCollectionMatch = {
  primary_release_id: number | null;
  copy_count: number;
};

export const RADAR_ENRICH_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
} as const);
export type RadarEnrichmentWorkflowStatus =
  (typeof RADAR_ENRICH_STATUS)[keyof typeof RADAR_ENRICH_STATUS];

export const RADAR_UPDATE_RUN_PHASE = Object.freeze({
  IDLE: 'idle',
  SYNCING: 'syncing',
  REVIEWING_PRICES: 'reviewing_prices',
  COMPLETED: 'completed',
  COMPLETED_WITH_ISSUES: 'completed_with_issues',
  FAILED: 'failed',
  STOPPED: 'stopped',
} as const);
export type RadarUpdateRunPhase =
  (typeof RADAR_UPDATE_RUN_PHASE)[keyof typeof RADAR_UPDATE_RUN_PHASE];

export type RadarRelease = {
  id: number | null;
  user_id: number | null;
  release_id: number | null;
  title: string;
  artist: string;
  year: number | null;
  cover_url: string | null;
  date_added: string | null;
  local: {
    priority: RadarPriority;
    target_price: number | null;
    target_price_eur: number | null;
    minimum_condition: RadarMinimumCondition | null;
    note: string;
    hidden: boolean;
    resolved: boolean;
  };
  source: {
    origin: RadarSourceOrigin;
    status: RadarSourceStatus;
    last_seen_at: string | null;
  };
  marketplace: {
    status: MarketplaceStatus;
    estimated_price: number | null;
    last_checked_at: string | null;
  };
  timestamps: {
    created_at: string | null;
    updated_at: string | null;
  };
  opportunity: {
    reasons: RadarOpportunityReason[];
    default_visible: boolean;
    is_in_collection: boolean;
    collection_match: RadarCollectionMatch | null;
  };
  display_currency: string | null;
};

export type RadarSummary = {
  total: number;
  active: number;
  hidden: number;
  resolved: number;
  missingFromSource: number;
  priced: number;
  pending: number;
  failed: number;
  unavailable: number;
};

export type RadarResponse = {
  items: RadarRelease[];
  summary: RadarSummary;
};

export type RadarSyncResult = {
  totalFetched: number;
  added: number;
  updated: number;
  reactivated: number;
  markedMissing: number;
  ignored: number;
};

export type RadarSyncResponse = {
  radar: RadarResponse;
  result: RadarSyncResult;
};

export type RadarWantlistTemplateFormat = 'csv' | 'xlsx';

export type RadarWantlistColumnKey =
  | 'release_id'
  | 'artist'
  | 'title'
  | 'year'
  | 'notes'
  | 'date_added'
  | 'target_price'
  | 'minimum_condition'
  | 'priority';

export type RadarWantlistPreviewColumn = {
  header: string;
  key: RadarWantlistColumnKey;
  required: boolean;
};

export type RadarWantlistPreviewRow = {
  row: number;
  release_id: number;
  artist: string | null;
  title: string | null;
  year: number | null;
  notes: string | null;
  date_added: string | null;
  target_price: number | null;
  minimum_condition: RadarMinimumCondition | null;
  priority: RadarPriority | null;
};

export type RadarWantlistPreviewError = {
  row: number;
  column: string;
  value: string;
  reason: string;
};

export type RadarWantlistPreviewResponse = {
  previewId: string | null;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
  mappedColumns: RadarWantlistPreviewColumn[];
  ignoredColumns: string[];
  rows: RadarWantlistPreviewRow[];
  errors: RadarWantlistPreviewError[];
};

export type RadarWantlistApplyResult = {
  totalRows: number;
  imported: number;
  skipped: number;
  added: number;
  updated: number;
};

export type RadarWantlistApplyResponse = {
  ok: boolean;
  radar: RadarResponse;
  result: RadarWantlistApplyResult;
};

export type RadarLocalDecisionPayload = {
  local: {
    priority: RadarPriority;
    target_price: number | null;
    minimum_condition: RadarMinimumCondition | null;
    note: string;
    hidden: boolean;
    resolved: boolean;
  };
};

export type RadarLocalDecisionUpdate = {
  priority: RadarPriority;
  targetPriceEur: number | null;
  minimumCondition: RadarMinimumCondition | null;
  note: string;
  hidden: boolean;
  resolved: boolean;
};

export type RadarEnrichmentStatus = {
  status: RadarEnrichmentWorkflowStatus;
  current: number;
  total: number;
  pending: number;
  progressPercent: number;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  isRunning: boolean;
  isTerminal: boolean;
};

export type RadarUpdateRunStatus = {
  phase: RadarUpdateRunPhase;
  current: number;
  total: number;
  pending: number;
  progressPercent: number;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  wantlist: RadarSyncResult;
  isRunning: boolean;
  isTerminal: boolean;
  canStop: boolean;
};

const RADAR_PRIORITIES = new Set<RadarPriority>(Object.values(RADAR_PRIORITY));
const RADAR_MINIMUM_CONDITIONS = new Set<RadarMinimumCondition>(Object.values(RADAR_MINIMUM_CONDITION));
const RADAR_WANTLIST_COLUMN_KEYS = new Set<RadarWantlistColumnKey>([
  'release_id',
  'artist',
  'title',
  'year',
  'notes',
  'date_added',
  'target_price',
  'minimum_condition',
  'priority',
]);
const RADAR_SOURCE_ORIGINS = new Set<RadarSourceOrigin>(Object.values(RADAR_SOURCE_ORIGIN));
const RADAR_SOURCE_STATUSES = new Set<RadarSourceStatus>(Object.values(RADAR_SOURCE_STATUS));
const RADAR_OPPORTUNITY_REASONS = new Set<RadarOpportunityReason>(Object.values(RADAR_OPPORTUNITY_REASON));
const RADAR_ENRICH_STATUSES = new Set<RadarEnrichmentWorkflowStatus>(Object.values(RADAR_ENRICH_STATUS));
const RADAR_UPDATE_RUN_PHASES = new Set<RadarUpdateRunPhase>(Object.values(RADAR_UPDATE_RUN_PHASE));
const MARKETPLACE_STATUSES = new Set<MarketplaceStatus>(Object.values(MARKETPLACE_STATUS));
const RADAR_TERMINAL_ENRICH_STATUSES = new Set<RadarEnrichmentWorkflowStatus>([
  RADAR_ENRICH_STATUS.COMPLETED,
  RADAR_ENRICH_STATUS.FAILED,
  RADAR_ENRICH_STATUS.STOPPED,
]);
const RADAR_TERMINAL_UPDATE_RUN_PHASES = new Set<RadarUpdateRunPhase>([
  RADAR_UPDATE_RUN_PHASE.COMPLETED,
  RADAR_UPDATE_RUN_PHASE.COMPLETED_WITH_ISSUES,
  RADAR_UPDATE_RUN_PHASE.FAILED,
  RADAR_UPDATE_RUN_PHASE.STOPPED,
]);

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asCount(value: unknown): number {
  return asNumber(value, 0) ?? 0;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function valueFromSet<T extends string>(value: unknown, allowedValues: ReadonlySet<T>, fallback: T): T {
  return allowedValues.has(value as T) ? (value as T) : fallback;
}

function asRadarPriority(value: unknown): RadarPriority {
  return valueFromSet(value, RADAR_PRIORITIES, RADAR_PRIORITY.NORMAL);
}

function asNullableRadarPriority(value: unknown): RadarPriority | null {
  return RADAR_PRIORITIES.has(value as RadarPriority) ? (value as RadarPriority) : null;
}

function asRadarMinimumCondition(value: unknown): RadarMinimumCondition | null {
  return RADAR_MINIMUM_CONDITIONS.has(value as RadarMinimumCondition)
    ? (value as RadarMinimumCondition)
    : null;
}

function asRadarWantlistColumnKey(value: unknown): RadarWantlistColumnKey | null {
  return RADAR_WANTLIST_COLUMN_KEYS.has(value as RadarWantlistColumnKey)
    ? (value as RadarWantlistColumnKey)
    : null;
}

function asRadarSourceOrigin(value: unknown): RadarSourceOrigin {
  return valueFromSet(value, RADAR_SOURCE_ORIGINS, RADAR_SOURCE_ORIGIN.NONE);
}

function asRadarSourceStatus(value: unknown): RadarSourceStatus {
  return valueFromSet(value, RADAR_SOURCE_STATUSES, RADAR_SOURCE_STATUS.ACTIVE);
}

function asRadarOpportunityReason(value: unknown): RadarOpportunityReason | null {
  return RADAR_OPPORTUNITY_REASONS.has(value as RadarOpportunityReason)
    ? (value as RadarOpportunityReason)
    : null;
}

function asRadarEnrichmentWorkflowStatus(value: unknown): RadarEnrichmentWorkflowStatus {
  return valueFromSet(value, RADAR_ENRICH_STATUSES, RADAR_ENRICH_STATUS.IDLE);
}

function asRadarUpdateRunPhase(value: unknown): RadarUpdateRunPhase {
  return valueFromSet(value, RADAR_UPDATE_RUN_PHASES, RADAR_UPDATE_RUN_PHASE.IDLE);
}

function asMarketplaceStatus(value: unknown): MarketplaceStatus {
  return valueFromSet(value, MARKETPLACE_STATUSES, MARKETPLACE_STATUS.PENDING);
}

function progressPercent(current: number, total: number): number {
  if (!total) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

function isValidRadarRelease(release: RadarRelease): release is RadarRelease & { id: number; release_id: number } {
  return release.id != null && release.release_id != null;
}

function normalizeRadarCollectionMatch(value: unknown): RadarCollectionMatch | null {
  const collectionMatch = asRecord(value);
  if (!collectionMatch) {
    return null;
  }

  const normalizedCollectionMatch = {
    primary_release_id: asNumber(collectionMatch.primary_release_id),
    copy_count: asCount(collectionMatch.copy_count),
  };

  return normalizedCollectionMatch.primary_release_id != null
    && normalizedCollectionMatch.copy_count > 0
    ? normalizedCollectionMatch
    : null;
}

export function normalizeRadarRelease(release: unknown = {}): RadarRelease {
  const source = asRecord(release) ?? {};
  const local = asRecord(source.local) ?? {};
  const releaseSource = asRecord(source.source) ?? {};
  const marketplace = asRecord(source.marketplace) ?? {};
  const timestamps = asRecord(source.timestamps) ?? {};
  const opportunity = asRecord(source.opportunity) ?? {};
  const reasons = asArray(opportunity.reasons)
    .map((reason) => asRadarOpportunityReason(reason))
    .filter((reason): reason is RadarOpportunityReason => reason != null);

  return {
    id: asNumber(source.id),
    user_id: asNumber(source.user_id),
    release_id: asNumber(source.release_id),
    title: asText(source.title, '-'),
    artist: asText(source.artist, '-'),
    year: asNumber(source.year),
    cover_url: asNullableText(source.cover_url),
    date_added: asNullableText(source.date_added),
    local: {
      priority: asRadarPriority(local.priority),
      target_price: asNumber(local.target_price),
      target_price_eur: asNumber(local.target_price_eur),
      minimum_condition: asRadarMinimumCondition(local.minimum_condition),
      note: asText(local.note),
      hidden: asBoolean(local.hidden),
      resolved: asBoolean(local.resolved),
    },
    source: {
      origin: asRadarSourceOrigin(releaseSource.origin),
      status: asRadarSourceStatus(releaseSource.status),
      last_seen_at: asNullableText(releaseSource.last_seen_at),
    },
    marketplace: {
      status: asMarketplaceStatus(marketplace.status),
      estimated_price: asNumber(marketplace.estimated_price),
      last_checked_at: asNullableText(marketplace.last_checked_at),
    },
    timestamps: {
      created_at: asNullableText(timestamps.created_at),
      updated_at: asNullableText(timestamps.updated_at),
    },
    opportunity: {
      reasons,
      default_visible: asBoolean(opportunity.default_visible),
      is_in_collection: asBoolean(opportunity.is_in_collection),
      collection_match: normalizeRadarCollectionMatch(opportunity.collection_match),
    },
    display_currency: asNullableText(source.display_currency),
  };
}

export function normalizeRadarSummary(summary: unknown = {}): RadarSummary {
  const source = asRecord(summary) ?? {};

  return {
    total: asCount(source.total),
    active: asCount(source.active),
    hidden: asCount(source.hidden),
    resolved: asCount(source.resolved),
    missingFromSource: asCount(source.missingFromSource),
    priced: asCount(source.priced),
    pending: asCount(source.pending),
    failed: asCount(source.failed),
    unavailable: asCount(source.unavailable),
  };
}

export function normalizeRadarResponse(payload: unknown = {}): RadarResponse {
  const source = asRecord(payload) ?? {};

  return {
    items: asArray(source.items)
      .map((item) => normalizeRadarRelease(item))
      .filter(isValidRadarRelease),
    summary: normalizeRadarSummary(source.summary),
  };
}

export function normalizeRadarSyncResult(payload: unknown = {}): RadarSyncResult {
  const source = asRecord(payload) ?? {};

  return {
    totalFetched: asCount(source.totalFetched),
    added: asCount(source.added),
    updated: asCount(source.updated),
    reactivated: asCount(source.reactivated),
    markedMissing: asCount(source.markedMissing),
    ignored: asCount(source.ignored),
  };
}

export function normalizeRadarSyncResponse(payload: unknown = {}): RadarSyncResponse {
  const source = asRecord(payload) ?? {};

  return {
    radar: normalizeRadarResponse(source.radar),
    result: normalizeRadarSyncResult(source.result),
  };
}

export function normalizeRadarEnrichmentStatus(payload: unknown = {}): RadarEnrichmentStatus {
  const source = asRecord(payload) ?? {};
  const status = asRadarEnrichmentWorkflowStatus(source.status);
  const current = asCount(source.current);
  const total = asCount(source.total);

  return {
    status,
    current,
    total,
    pending: asCount(source.pending),
    progressPercent: progressPercent(current, total),
    message: asText(source.message),
    startedAt: asNullableText(source.startedAt),
    finishedAt: asNullableText(source.finishedAt),
    isRunning: status === RADAR_ENRICH_STATUS.RUNNING,
    isTerminal: RADAR_TERMINAL_ENRICH_STATUSES.has(status),
  };
}

export function normalizeRadarUpdateRunStatus(payload: unknown = {}): RadarUpdateRunStatus {
  const source = asRecord(payload) ?? {};
  const phase = asRadarUpdateRunPhase(source.phase);
  const current = asCount(source.current);
  const total = asCount(source.total);

  return {
    phase,
    current,
    total,
    pending: asCount(source.pending),
    progressPercent: progressPercent(current, total),
    message: asText(source.message),
    startedAt: asNullableText(source.startedAt),
    finishedAt: asNullableText(source.finishedAt),
    wantlist: normalizeRadarSyncResult(source.wantlist),
    isRunning: phase === RADAR_UPDATE_RUN_PHASE.SYNCING || phase === RADAR_UPDATE_RUN_PHASE.REVIEWING_PRICES,
    isTerminal: RADAR_TERMINAL_UPDATE_RUN_PHASES.has(phase),
    canStop: phase === RADAR_UPDATE_RUN_PHASE.REVIEWING_PRICES,
  };
}

export function normalizeRadarWantlistPreviewResponse(payload: unknown = {}): RadarWantlistPreviewResponse {
  const source = asRecord(payload) ?? {};
  const summary = asRecord(source.summary) ?? {};

  return {
    previewId: asNullableText(source.previewId),
    summary: {
      totalRows: asCount(summary.totalRows),
      validRows: asCount(summary.validRows),
      invalidRows: asCount(summary.invalidRows),
    },
    mappedColumns: asArray(source.mappedColumns)
      .map((column) => {
        const candidate = asRecord(column) ?? {};
        const key = asRadarWantlistColumnKey(candidate.key);
        const header = asText(candidate.header);

        if (!key || !header) {
          return null;
        }

        return {
          header,
          key,
          required: asBoolean(candidate.required),
        };
      })
      .filter((column): column is RadarWantlistPreviewColumn => column != null),
    ignoredColumns: asArray(source.ignoredColumns)
      .map((column) => asText(column))
      .filter(Boolean),
    rows: asArray(source.rows)
      .map((row) => {
        const candidate = asRecord(row) ?? {};
        return {
          row: asCount(candidate.row),
          release_id: asCount(candidate.release_id),
          artist: asNullableText(candidate.artist),
          title: asNullableText(candidate.title),
          year: asNumber(candidate.year),
          notes: asNullableText(candidate.notes),
          date_added: asNullableText(candidate.date_added),
          target_price: asNumber(candidate.target_price),
          minimum_condition: asRadarMinimumCondition(candidate.minimum_condition),
          priority: asNullableRadarPriority(candidate.priority),
        };
      })
      .filter((row) => row.row > 0 && row.release_id > 0),
    errors: asArray(source.errors)
      .map((error) => {
        const candidate = asRecord(error) ?? {};
        return {
          row: asCount(candidate.row),
          column: asText(candidate.column),
          value: asText(candidate.value),
          reason: asText(candidate.reason),
        };
      })
      .filter((error) => error.row > 0 && error.column && error.reason),
  };
}

export function normalizeRadarWantlistApplyResponse(payload: unknown = {}): RadarWantlistApplyResponse {
  const source = asRecord(payload) ?? {};
  const result = asRecord(source.result) ?? {};

  return {
    ok: asBoolean(source.ok),
    radar: normalizeRadarResponse(source.radar),
    result: {
      totalRows: asCount(result.totalRows),
      imported: asCount(result.imported),
      skipped: asCount(result.skipped),
      added: asCount(result.added),
      updated: asCount(result.updated),
    },
  };
}

export { MARKETPLACE_STATUS };
