import { existsSync, mkdirSync } from 'fs';
import { access, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { resolveRuntimePaths } from '../runtimePaths.js';

const { dataDir } = resolveRuntimePaths(import.meta.url);
const coversDir = join(dataDir, 'covers');
const REMOTE_IMAGE_HOSTS = new Set(['i.discogs.com', 'img.discogs.com']);
const USER_AGENT = 'Discographic/1.0';

const COVER_VARIANTS = {
  detail: { width: 720, quality: 84 },
  wall: { width: 320, quality: 78 },
  tapete: { width: 220, quality: 88 },
  poster: { width: 96, quality: 58 }
};

type CoverVariant = keyof typeof COVER_VARIANTS;
type ReleaseCover = {
  id: string | number;
  cover_url?: string | null;
};
type Translate = (key: string) => string;
type RemoteImage = {
  contentType: string;
  buffer: Buffer;
};

if (!existsSync(coversDir)) {
  mkdirSync(coversDir, { recursive: true });
}

function getUserCoverDir(userId: string | number): string {
  return join(coversDir, String(userId));
}

function getCachePath(userId: string | number, releaseId: string | number, variant: string): string {
  return join(getUserCoverDir(userId), `${releaseId}-${variant}.jpg`);
}

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function getVariantConfig(variant: string): (typeof COVER_VARIANTS)[CoverVariant] {
  return COVER_VARIANTS[variant as CoverVariant] || COVER_VARIANTS.wall;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export function isAllowedRemoteImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && REMOTE_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function fetchRemoteImage(url: string): Promise<RemoteImage> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Remote fetch failed: HTTP ${response.status}`);
  }

  return {
    contentType: response.headers.get('content-type') || 'image/jpeg',
    buffer: Buffer.from(await response.arrayBuffer())
  };
}

export async function ensureCachedCover({
  release,
  userId,
  variant,
  t = null
}: {
  release: ReleaseCover;
  userId: string | number;
  variant: string;
  t?: Translate | null;
}): Promise<string> {
  const variantConfig = getVariantConfig(variant);
  const userDir = getUserCoverDir(userId);
  await ensureDir(userDir);

  const cachePath = getCachePath(userId, release.id, variant);
  try {
    await access(cachePath);
    return cachePath;
  } catch {
    // Cache miss, continue and build it.
  }

  if (!release.cover_url || !isAllowedRemoteImageUrl(release.cover_url)) {
    throw new Error(t ? t('backend.media.coverUnavailable') : 'Cover image is not available');
  }

  let source;
  try {
    source = await fetchRemoteImage(release.cover_url);
  } catch {
    throw new Error(t ? t('backend.media.coverDownloadFailed') : 'Could not download cover image');
  }

  const resized = await sharp(source.buffer)
    .resize({ width: variantConfig.width, withoutEnlargement: true })
    .jpeg({ quality: variantConfig.quality, mozjpeg: true })
    .toBuffer();

  await writeFile(cachePath, resized);
  return cachePath;
}

export async function removeCachedCovers({
  userId,
  releaseIds
}: {
  userId: string | number;
  releaseIds?: Array<string | number> | null;
}): Promise<void> {
  if (!releaseIds?.length) {
    return;
  }

  const variants = Object.keys(COVER_VARIANTS) as CoverVariant[];

  await Promise.all(releaseIds.flatMap((releaseId) =>
    variants.map(async (variant) => {
      const cachePath = getCachePath(userId, releaseId, variant);
      try {
        await unlink(cachePath);
      } catch (error) {
        if (!hasErrorCode(error, 'ENOENT')) {
          throw error;
        }
      }
    })
  ));
}

function computeOptimalTileSize(numItems: number, canvasWidth: number, canvasHeight: number): number {
  const candidateColumns = Math.ceil(Math.sqrt(numItems * canvasWidth / canvasHeight));
  const tileSizeByColumns = (Math.floor(candidateColumns * canvasHeight / canvasWidth) * candidateColumns < numItems)
    ? canvasHeight / Math.ceil(candidateColumns * canvasHeight / canvasWidth)
    : canvasWidth / candidateColumns;

  const candidateRows = Math.ceil(Math.sqrt(numItems * canvasHeight / canvasWidth));
  const tileSizeByRows = (Math.floor(candidateRows * canvasWidth / canvasHeight) * candidateRows < numItems)
    ? canvasWidth / Math.ceil(canvasWidth * candidateRows / canvasHeight)
    : canvasHeight / candidateRows;

  return Math.max(tileSizeByColumns, tileSizeByRows);
}

export function selectTapeteVariant(rawTileSize: number): CoverVariant {
  if (rawTileSize > COVER_VARIANTS.wall.width) {
    return 'detail';
  }

  if (rawTileSize > COVER_VARIANTS.tapete.width) {
    return 'wall';
  }

  return 'tapete';
}

export async function generateTapeteImage({
  releases,
  userId,
  maxSize
}: {
  releases: ReleaseCover[];
  userId: string | number;
  maxSize: number;
}): Promise<Buffer> {
  const rawTileSize = Math.floor(computeOptimalTileSize(releases.length, maxSize, maxSize));
  const variant = selectTapeteVariant(rawTileSize);
  const variantMaxPx = COVER_VARIANTS[variant].width;
  const tileSize = Math.min(rawTileSize, variantMaxPx);
  const cols = Math.max(1, Math.floor(maxSize / tileSize));
  const rows = Math.ceil(releases.length / cols);
  const canvasWidth = cols * tileSize;
  const canvasHeight = rows * tileSize;
  const tiles: Array<string | null> = [];

  for (const release of releases) {
    try {
      const cachePath = await ensureCachedCover({ release, userId, variant });
      tiles.push(cachePath);
    } catch {
      tiles.push(null);
    }
  }

  const compositeInputs = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const tilePath = tiles[i];
    if (!tilePath) continue;

    const col = i % cols;
    const row = Math.floor(i / cols);

    compositeInputs.push({
      input: await sharp(tilePath)
        .resize({ width: tileSize, height: tileSize, fit: 'cover' })
        .toBuffer(),
      left: col * tileSize,
      top: row * tileSize
    });
  }

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 3, g: 7, b: 18 }
    }
  })
    .composite(compositeInputs)
    .jpeg({ quality: 96, mozjpeg: true })
    .toBuffer();
}
