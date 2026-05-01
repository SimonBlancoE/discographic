import { MARKETPLACE_STATUS, type MarketplaceStatus } from './marketplace.js';

type UnknownRecord = Record<string, unknown>;
type UnknownArray = unknown[];
export type LocalCoverVariant = 'detail' | 'wall' | 'poster';
export type ReleaseNote = UnknownRecord;
export type ReleaseTrack = UnknownRecord;
export type ReleaseJsonObject = UnknownRecord;
export type ReleaseListEntry = string | UnknownRecord;
export type ReleaseFilters = Record<string, unknown>;
export type ReleasePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type CollectionRelease = {
  id: number | null;
  user_id: number | null;
  release_id: number | null;
  instance_id: number | null;
  title: string;
  artist: string;
  year: number | null;
  genres: UnknownArray;
  styles: UnknownArray;
  formats: ReleaseListEntry[];
  labels: ReleaseListEntry[];
  country: string | null;
  cover_url: string | null;
  rating: number;
  notes: UnknownArray;
  notes_text: string;
  date_added: string | null;
  estimated_value: number | null;
  marketplace_status: MarketplaceStatus;
  listing_status: string | null;
  listing_price: number | null;
  listing_currency: string | null;
  listing_price_eur: number | null;
  folder_id: number;
  synced_at: string | null;
  display_currency: string | null;
};
export type ReleaseDetail = CollectionRelease & {
  tracklist: UnknownArray;
  raw_json: ReleaseJsonObject | null;
  detail_cover_url: string | null;
  wall_cover_url: string | null;
  poster_cover_url: string | null;
};
export type WallRelease = {
  id: number | null;
  release_id: number | null;
  title: string;
  artist: string;
  year: number | null;
  genres: UnknownArray;
  styles: UnknownArray;
  formats: ReleaseListEntry[];
  labels: ReleaseListEntry[];
  cover_url: string | null;
  wall_cover_url: string | null;
  poster_cover_url: string | null;
};
export type CollectionResponse = {
  releases: CollectionRelease[];
  displayCurrency: string | null;
  pagination: ReleasePagination;
  filters: ReleaseFilters;
};
export type WallResponse = {
  releases: WallRelease[];
  filters: ReleaseFilters;
};

const LOCAL_COVER_VARIANTS = new Set<LocalCoverVariant>(['detail', 'wall', 'poster']);
const MARKETPLACE_STATUSES = new Set<MarketplaceStatus>(Object.values(MARKETPLACE_STATUS));

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asObject(value: unknown): ReleaseJsonObject | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ReleaseJsonObject;
  }

  if (typeof value !== 'string' || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ReleaseJsonObject)
      : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asReleaseListEntries(value: unknown): ReleaseListEntry[] {
  return asArray(value) as ReleaseListEntry[];
}

function isMarketplaceStatus(value: unknown): value is MarketplaceStatus {
  return MARKETPLACE_STATUSES.has(value as MarketplaceStatus);
}

function asMarketplaceStatus(value: unknown): MarketplaceStatus {
  return isMarketplaceStatus(value) ? value : MARKETPLACE_STATUS.PENDING;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function validCollectionRelease(release: CollectionRelease): release is CollectionRelease & { id: number } {
  return release.id != null;
}

function validWallRelease(release: WallRelease): release is WallRelease & { id: number } {
  return release.id != null;
}

function isLocalCoverVariant(value: unknown): value is LocalCoverVariant {
  return LOCAL_COVER_VARIANTS.has(value as LocalCoverVariant);
}

export function buildLocalCoverUrl(id: unknown, variant: unknown): string | null {
  const normalizedId = asNumber(id);
  if (normalizedId == null || !isLocalCoverVariant(variant)) {
    return null;
  }

  return `/api/media/cover/${normalizedId}?variant=${variant}`;
}

export function normalizeCollectionRelease(release: unknown = {}): CollectionRelease {
  const source = asRecord(release) ?? {};
  const id = asNumber(source.id);

  return {
    id,
    user_id: asNumber(source.user_id),
    release_id: asNumber(source.release_id),
    instance_id: asNumber(source.instance_id),
    title: asText(source.title, '-'),
    artist: asText(source.artist, '-'),
    year: asNumber(source.year),
    genres: asArray(source.genres),
    styles: asArray(source.styles),
    formats: asReleaseListEntries(source.formats),
    labels: asReleaseListEntries(source.labels),
    country: asNullableText(source.country),
    cover_url: asNullableText(source.cover_url),
    rating: asNumber(source.rating, 0) ?? 0,
    notes: asArray(source.notes),
    notes_text: asText(source.notes_text),
    date_added: asNullableText(source.date_added),
    estimated_value: asNumber(source.estimated_value),
    marketplace_status: asMarketplaceStatus(source.marketplace_status),
    listing_status: asNullableText(source.listing_status),
    listing_price: asNumber(source.listing_price),
    listing_currency: asNullableText(source.listing_currency),
    listing_price_eur: asNumber(source.listing_price_eur),
    folder_id: asNumber(source.folder_id, 0) ?? 0,
    synced_at: asNullableText(source.synced_at),
    display_currency: asNullableText(source.display_currency)
  };
}

export function normalizeReleaseDetail(release: unknown = {}): ReleaseDetail {
  const source = asRecord(release) ?? {};
  const normalized = normalizeCollectionRelease(release);

  return {
    ...normalized,
    tracklist: asArray(source.tracklist),
    raw_json: asObject(source.raw_json),
    detail_cover_url: buildLocalCoverUrl(normalized.id, 'detail'),
    wall_cover_url: buildLocalCoverUrl(normalized.id, 'wall'),
    poster_cover_url: buildLocalCoverUrl(normalized.id, 'poster')
  };
}

export function normalizeRandomRelease(release: unknown = {}): ReleaseDetail {
  return normalizeReleaseDetail(release);
}

export function normalizeWallRelease(release: unknown = {}): WallRelease {
  const source = asRecord(release) ?? {};
  const id = asNumber(source.id);

  return {
    id,
    release_id: asNumber(source.release_id),
    title: asText(source.title, '-'),
    artist: asText(source.artist, '-'),
    year: asNumber(source.year),
    genres: asArray(source.genres),
    styles: asArray(source.styles),
    formats: asReleaseListEntries(source.formats),
    labels: asReleaseListEntries(source.labels),
    cover_url: asNullableText(source.cover_url),
    wall_cover_url: buildLocalCoverUrl(id, 'wall'),
    poster_cover_url: buildLocalCoverUrl(id, 'poster')
  };
}

function normalizePagination(pagination: unknown = {}, releaseCount = 0): ReleasePagination {
  const source = asRecord(pagination) ?? {};
  return {
    page: asNumber(source.page, 1) ?? 1,
    limit: asNumber(source.limit, releaseCount) ?? releaseCount,
    total: asNumber(source.total, releaseCount) ?? releaseCount,
    totalPages: asNumber(source.totalPages, 1) ?? 1
  };
}

function normalizeFilters(filters: unknown): ReleaseFilters {
  return filters && typeof filters === 'object' && !Array.isArray(filters)
    ? (filters as ReleaseFilters)
    : {};
}

export function normalizeCollectionResponse(payload: unknown = {}): CollectionResponse {
  const source = asRecord(payload) ?? {};
  const releases = asArray(source.releases)
    .map(normalizeCollectionRelease)
    .filter(validCollectionRelease);

  return {
    releases,
    displayCurrency: asNullableText(source.displayCurrency),
    pagination: normalizePagination(source.pagination, releases.length),
    filters: normalizeFilters(source.filters)
  };
}

export function normalizeWallResponse(payload: unknown = {}): WallResponse {
  const source = asRecord(payload) ?? {};
  const releases = asArray(source.releases)
    .map(normalizeWallRelease)
    .filter(validWallRelease);

  return {
    releases,
    filters: normalizeFilters(source.filters)
  };
}
