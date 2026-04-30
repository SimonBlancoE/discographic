import { MARKETPLACE_STATUS } from './marketplace.js';

const LOCAL_COVER_VARIANTS = new Set(['detail', 'wall', 'poster']);
const MARKETPLACE_STATUSES = new Set(Object.values(MARKETPLACE_STATUS));

function asArray(value) {
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

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asNumber(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value) {
  return typeof value === 'string' && value ? value : null;
}

function asMarketplaceStatus(value) {
  return MARKETPLACE_STATUSES.has(value) ? value : MARKETPLACE_STATUS.PENDING;
}

function validRelease(release) {
  return release?.id != null;
}

export function buildLocalCoverUrl(id, variant) {
  const normalizedId = asNumber(id);
  if (normalizedId == null || !LOCAL_COVER_VARIANTS.has(variant)) {
    return null;
  }

  return `/api/media/cover/${normalizedId}?variant=${variant}`;
}

export function normalizeCollectionRelease(release = {}) {
  const id = asNumber(release.id);

  return {
    id,
    user_id: asNumber(release.user_id),
    release_id: asNumber(release.release_id),
    instance_id: asNumber(release.instance_id),
    title: asText(release.title, '-'),
    artist: asText(release.artist, '-'),
    year: asNumber(release.year),
    genres: asArray(release.genres),
    styles: asArray(release.styles),
    formats: asArray(release.formats),
    labels: asArray(release.labels),
    country: asNullableText(release.country),
    cover_url: asNullableText(release.cover_url),
    rating: asNumber(release.rating, 0),
    notes: asArray(release.notes),
    notes_text: asText(release.notes_text),
    date_added: asNullableText(release.date_added),
    estimated_value: asNumber(release.estimated_value),
    marketplace_status: asMarketplaceStatus(release.marketplace_status),
    listing_status: asNullableText(release.listing_status),
    listing_price: asNumber(release.listing_price),
    listing_currency: asNullableText(release.listing_currency),
    listing_price_eur: asNumber(release.listing_price_eur),
    folder_id: asNumber(release.folder_id, 0),
    synced_at: asNullableText(release.synced_at),
    display_currency: asNullableText(release.display_currency)
  };
}

export function normalizeReleaseDetail(release = {}) {
  const normalized = normalizeCollectionRelease(release);

  return {
    ...normalized,
    tracklist: asArray(release.tracklist),
    raw_json: asObject(release.raw_json),
    detail_cover_url: buildLocalCoverUrl(normalized.id, 'detail'),
    wall_cover_url: buildLocalCoverUrl(normalized.id, 'wall'),
    poster_cover_url: buildLocalCoverUrl(normalized.id, 'poster')
  };
}

export function normalizeRandomRelease(release = {}) {
  return normalizeReleaseDetail(release);
}

export function normalizeWallRelease(release = {}) {
  const id = asNumber(release.id);

  return {
    id,
    release_id: asNumber(release.release_id),
    title: asText(release.title, '-'),
    artist: asText(release.artist, '-'),
    year: asNumber(release.year),
    genres: asArray(release.genres),
    styles: asArray(release.styles),
    formats: asArray(release.formats),
    labels: asArray(release.labels),
    cover_url: asNullableText(release.cover_url),
    wall_cover_url: buildLocalCoverUrl(id, 'wall'),
    poster_cover_url: buildLocalCoverUrl(id, 'poster')
  };
}

function normalizePagination(pagination = {}, releaseCount = 0) {
  return {
    page: asNumber(pagination.page, 1),
    limit: asNumber(pagination.limit, releaseCount),
    total: asNumber(pagination.total, releaseCount),
    totalPages: asNumber(pagination.totalPages, 1)
  };
}

function normalizeFilters(filters) {
  return filters && typeof filters === 'object' && !Array.isArray(filters) ? filters : {};
}

export function normalizeCollectionResponse(payload = {}) {
  const releases = asArray(payload.releases)
    .map(normalizeCollectionRelease)
    .filter(validRelease);

  return {
    releases,
    displayCurrency: asNullableText(payload.displayCurrency),
    pagination: normalizePagination(payload.pagination, releases.length),
    filters: normalizeFilters(payload.filters)
  };
}

export function normalizeWallResponse(payload = {}) {
  const releases = asArray(payload.releases)
    .map(normalizeWallRelease)
    .filter(validRelease);

  return {
    releases,
    filters: normalizeFilters(payload.filters)
  };
}
