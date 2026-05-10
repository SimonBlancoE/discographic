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

const RADAR_PRIORITIES = new Set<RadarPriority>(Object.values(RADAR_PRIORITY));
const RADAR_MINIMUM_CONDITIONS = new Set<RadarMinimumCondition>(Object.values(RADAR_MINIMUM_CONDITION));
const RADAR_SOURCE_ORIGINS = new Set<RadarSourceOrigin>(Object.values(RADAR_SOURCE_ORIGIN));
const RADAR_SOURCE_STATUSES = new Set<RadarSourceStatus>(Object.values(RADAR_SOURCE_STATUS));
const MARKETPLACE_STATUSES = new Set<MarketplaceStatus>(Object.values(MARKETPLACE_STATUS));

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

function asRadarMinimumCondition(value: unknown): RadarMinimumCondition | null {
  return RADAR_MINIMUM_CONDITIONS.has(value as RadarMinimumCondition)
    ? (value as RadarMinimumCondition)
    : null;
}

function asRadarSourceOrigin(value: unknown): RadarSourceOrigin {
  return valueFromSet(value, RADAR_SOURCE_ORIGINS, RADAR_SOURCE_ORIGIN.NONE);
}

function asRadarSourceStatus(value: unknown): RadarSourceStatus {
  return valueFromSet(value, RADAR_SOURCE_STATUSES, RADAR_SOURCE_STATUS.ACTIVE);
}

function asMarketplaceStatus(value: unknown): MarketplaceStatus {
  return valueFromSet(value, MARKETPLACE_STATUSES, MARKETPLACE_STATUS.PENDING);
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

export { MARKETPLACE_STATUS };
