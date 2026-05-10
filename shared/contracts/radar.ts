import { MARKETPLACE_STATUS, type MarketplaceStatus } from './marketplace.js';

type UnknownRecord = Record<string, unknown>;

export const RADAR_PRIORITY = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
} as const);
export type RadarPriority = (typeof RADAR_PRIORITY)[keyof typeof RADAR_PRIORITY];

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

export const RADAR_ENRICH_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
} as const);
export type RadarEnrichmentWorkflowStatus = (typeof RADAR_ENRICH_STATUS)[keyof typeof RADAR_ENRICH_STATUS];

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
    target_price_eur: number | null;
    minimum_condition: string | null;
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
    listing_status: string | null;
    listing_price: number | null;
    listing_currency: string | null;
    listing_price_eur: number | null;
    last_checked_at: string | null;
  };
  timestamps: {
    created_at: string | null;
    updated_at: string | null;
  };
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

const RADAR_PRIORITIES = new Set<RadarPriority>(Object.values(RADAR_PRIORITY));
const RADAR_SOURCE_ORIGINS = new Set<RadarSourceOrigin>(Object.values(RADAR_SOURCE_ORIGIN));
const RADAR_SOURCE_STATUSES = new Set<RadarSourceStatus>(Object.values(RADAR_SOURCE_STATUS));
const RADAR_ENRICH_STATUSES = new Set<RadarEnrichmentWorkflowStatus>(Object.values(RADAR_ENRICH_STATUS));
const MARKETPLACE_STATUSES = new Set<MarketplaceStatus>(Object.values(MARKETPLACE_STATUS));
const RADAR_TERMINAL_ENRICH_STATUSES = new Set<RadarEnrichmentWorkflowStatus>([
  RADAR_ENRICH_STATUS.COMPLETED,
  RADAR_ENRICH_STATUS.FAILED,
  RADAR_ENRICH_STATUS.STOPPED,
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

function asRadarSourceOrigin(value: unknown): RadarSourceOrigin {
  return valueFromSet(value, RADAR_SOURCE_ORIGINS, RADAR_SOURCE_ORIGIN.NONE);
}

function asRadarSourceStatus(value: unknown): RadarSourceStatus {
  return valueFromSet(value, RADAR_SOURCE_STATUSES, RADAR_SOURCE_STATUS.ACTIVE);
}

function asRadarEnrichmentWorkflowStatus(value: unknown): RadarEnrichmentWorkflowStatus {
  return valueFromSet(value, RADAR_ENRICH_STATUSES, RADAR_ENRICH_STATUS.IDLE);
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

export function normalizeRadarRelease(release: unknown = {}): RadarRelease {
  const source = asRecord(release) ?? {};
  const local = asRecord(source.local) ?? {};
  const releaseSource = asRecord(source.source) ?? {};
  const marketplace = asRecord(source.marketplace) ?? {};
  const timestamps = asRecord(source.timestamps) ?? {};

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
      target_price_eur: asNumber(local.target_price_eur),
      minimum_condition: asNullableText(local.minimum_condition),
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
      listing_status: asNullableText(marketplace.listing_status),
      listing_price: asNumber(marketplace.listing_price),
      listing_currency: asNullableText(marketplace.listing_currency),
      listing_price_eur: asNumber(marketplace.listing_price_eur),
      last_checked_at: asNullableText(marketplace.last_checked_at),
    },
    timestamps: {
      created_at: asNullableText(timestamps.created_at),
      updated_at: asNullableText(timestamps.updated_at),
    },
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

export { MARKETPLACE_STATUS };
