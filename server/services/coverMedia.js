import { existsSync, mkdirSync } from 'fs';
import { access, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const coversDir = join(__dirname, '..', '..', 'data', 'covers');
const REMOTE_IMAGE_HOSTS = new Set(['i.discogs.com', 'img.discogs.com']);
const USER_AGENT = 'Discographic/1.0';

const COVER_VARIANTS = {
  detail: { width: 720, quality: 84 },
  wall: { width: 320, quality: 78 },
  tapete: { width: 220, quality: 88 },
  poster: { width: 96, quality: 58 }
};

if (!existsSync(coversDir)) {
  mkdirSync(coversDir, { recursive: true });
}

function getUserCoverDir(userId) {
  return join(coversDir, String(userId));
}

function getCachePath(userId, releaseId, variant) {
  return join(getUserCoverDir(userId), `${releaseId}-${variant}.jpg`);
}

async function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function isAllowedRemoteImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && REMOTE_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function fetchRemoteImage(url) {
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

export async function ensureCachedCover({ release, userId, variant, t = null }) {
  const variantConfig = COVER_VARIANTS[variant] || COVER_VARIANTS.wall;
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

export async function removeCachedCovers({ userId, releaseIds }) {
  if (!releaseIds?.length) {
    return;
  }

  const variants = Object.keys(COVER_VARIANTS);

  await Promise.all(releaseIds.flatMap((releaseId) =>
    variants.map(async (variant) => {
      const cachePath = getCachePath(userId, releaseId, variant);
      try {
        await unlink(cachePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    })
  ));
}

function computeOptimalTileSize(numItems, canvasWidth, canvasHeight) {
  const a = Math.ceil(Math.sqrt(numItems * canvasWidth / canvasHeight));
  const r = (Math.floor(a * canvasHeight / canvasWidth) * a < numItems)
    ? canvasHeight / Math.ceil(a * canvasHeight / canvasWidth)
    : canvasWidth / a;

  const o = Math.ceil(Math.sqrt(numItems * canvasHeight / canvasWidth));
  const l = (Math.floor(o * canvasWidth / canvasHeight) * o < numItems)
    ? canvasWidth / Math.ceil(canvasWidth * o / canvasHeight)
    : canvasHeight / o;

  return Math.max(r, l);
}

export function selectTapeteVariant(rawTileSize) {
  if (rawTileSize > COVER_VARIANTS.wall.width) {
    return 'detail';
  }

  if (rawTileSize > COVER_VARIANTS.tapete.width) {
    return 'wall';
  }

  return 'tapete';
}

export async function generateTapeteImage({ releases, userId, maxSize }) {
  const rawTileSize = Math.floor(computeOptimalTileSize(releases.length, maxSize, maxSize));
  const variant = selectTapeteVariant(rawTileSize);
  const variantMaxPx = COVER_VARIANTS[variant].width;
  const tileSize = Math.min(rawTileSize, variantMaxPx);
  const cols = Math.max(1, Math.floor(maxSize / tileSize));
  const rows = Math.ceil(releases.length / cols);
  const canvasWidth = cols * tileSize;
  const canvasHeight = rows * tileSize;
  const tiles = [];

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
    if (!tiles[i]) continue;

    const col = i % cols;
    const row = Math.floor(i / cols);

    compositeInputs.push({
      input: await sharp(tiles[i])
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
