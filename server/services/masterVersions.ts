import type Database from 'better-sqlite3';
import { RADAR_SOURCE_STATUS } from '../../shared/contracts/radar.js';
import type { MasterVersion, MasterVersionsResponse } from '../../shared/contracts/masterVersions.js';

type MasterVersionsClient = {
  getMasterVersions: (masterId: number, page?: number, perPage?: number) => Promise<unknown>;
};

type CachedVersions = {
  fetchedAt: number;
  total: number;
  versions: Omit<MasterVersion, 'localReleaseId' | 'inRadar'>[];
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PER_PAGE = 100;
// Very popular masters have hundreds of pressings; two pages keep this to at most two requests.
const MAX_PAGES = 2;
const cache = new Map<number, CachedVersions>();

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asCount(value: unknown): number | null {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeVersion(entry: unknown): CachedVersions['versions'][number] | null {
  const source = asRecord(entry);
  const id = Number(source?.id);
  if (!source || !Number.isInteger(id) || id <= 0) {
    return null;
  }

  const community = asRecord(asRecord(source.stats)?.community);
  return {
    releaseId: id,
    title: asText(source.title) ?? '-',
    label: asText(source.label),
    catno: asText(source.catno),
    country: asText(source.country),
    format: asText(source.format),
    released: asText(source.released),
    thumb: asText(source.thumb),
    have: asCount(community?.in_collection),
    want: asCount(community?.in_wantlist),
  };
}

async function fetchVersions(discogs: MasterVersionsClient, masterId: number): Promise<CachedVersions> {
  const cached = cache.get(masterId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const versions: CachedVersions['versions'] = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = asRecord(await discogs.getMasterVersions(masterId, page, PER_PAGE));
    const pagination = asRecord(payload?.pagination);
    total = asCount(pagination?.items) ?? total;

    const list = Array.isArray(payload?.versions) ? payload.versions : [];
    versions.push(...list.map(normalizeVersion).filter((item): item is CachedVersions['versions'][number] => item != null));

    const pages = asCount(pagination?.pages) ?? 1;
    if (page >= pages) {
      break;
    }
  }

  const entry = { fetchedAt: Date.now(), total: Math.max(total, versions.length), versions };
  cache.set(masterId, entry);
  return entry;
}

export async function getMasterVersionsForRelease({
  db,
  discogs,
  userId,
  release,
}: {
  db: Database.Database;
  discogs: MasterVersionsClient;
  userId: number;
  release: { id: number; release_id: number; master_id: number };
}): Promise<MasterVersionsResponse> {
  const { total, versions } = await fetchVersions(discogs, release.master_id);

  const owned = new Map(
    db.prepare<[number, number], { release_id: number; id: number }>(`
      SELECT release_id, MIN(id) AS id
      FROM releases
      WHERE user_id = ? AND master_id = ?
      GROUP BY release_id
    `).all(userId, release.master_id).map((row) => [row.release_id, row.id]),
  );

  const wanted = new Set(
    db.prepare<[number, string], { release_id: number }>(`
      SELECT release_id FROM radar_releases WHERE user_id = ? AND source_status = ?
    `).all(userId, RADAR_SOURCE_STATUS.ACTIVE).map((row) => row.release_id),
  );

  return {
    masterId: release.master_id,
    total,
    versions: versions.map((version) => ({
      ...version,
      localReleaseId: owned.get(version.releaseId) ?? null,
      inRadar: wanted.has(version.releaseId),
    })),
  };
}
