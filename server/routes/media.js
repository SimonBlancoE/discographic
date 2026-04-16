import express from 'express';
import { existsSync, mkdirSync } from 'fs';
import { access, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { buildCollectionWhere } from '../lib/collectionFilters.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const coversDir = join(__dirname, '..', '..', 'data', 'covers');

if (!existsSync(coversDir)) {
  mkdirSync(coversDir, { recursive: true });
}

router.use(requireAuth);

const VARIANTS = {
  detail: { width: 720, quality: 84 },
  wall: { width: 320, quality: 78 },
  tapete: { width: 220, quality: 88 },
  poster: { width: 96, quality: 58 }
};

function isAllowedRemote(url) {
  try {
    const parsed = new URL(url);
    return ['https:'].includes(parsed.protocol) && ['i.discogs.com', 'img.discogs.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

router.get('/proxy-image', asyncHandler(async (req, res) => {
  const target = String(req.query.url || '');

  if (!target || !isAllowedRemote(target)) {
    return res.status(400).json({ error: 'URL de imagen no permitida' });
  }

  const response = await fetch(target, {
    headers: { 'User-Agent': 'Discographic/1.0' }
  });

  if (!response.ok) {
    return res.status(502).json({ error: 'No se pudo obtener la imagen remota' });
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(Buffer.from(arrayBuffer));
}));

async function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export async function ensureCachedCover({ release, userId, variant }) {
  const variantConfig = VARIANTS[variant] || VARIANTS.wall;
  const userDir = join(coversDir, String(userId));
  await ensureDir(userDir);

  const cachePath = join(userDir, `${release.id}-${variant}.jpg`);
  try {
    await access(cachePath);
    return cachePath;
  } catch {
    // cache miss — fall through to fetch
  }

  if (!release.cover_url || !isAllowedRemote(release.cover_url)) {
    throw new Error('Cover image is not available');
  }

  const response = await fetch(release.cover_url, {
    headers: {
      'User-Agent': 'Discographic/1.0'
    }
  });

  if (!response.ok) {
    throw new Error('Could not download cover image');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const resized = await sharp(buffer)
    .resize({ width: variantConfig.width, withoutEnlargement: true })
    .jpeg({ quality: variantConfig.quality, mozjpeg: true })
    .toBuffer();

  await writeFile(cachePath, resized);
  return cachePath;
}

router.get('/cover/:id', asyncHandler(async (req, res) => {
  const release = db.prepare(`
    SELECT id, cover_url
    FROM releases
    WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!release) {
    return res.status(404).json({ error: 'Release no encontrado' });
  }

  // ensureCachedCover throws if the cover URL is missing or unfetchable;
  // for this endpoint that's a 404, not a 500.
  try {
    const variant = String(req.query.variant || 'wall');
    const cachePath = await ensureCachedCover({
      release,
      userId: req.session.userId,
      variant
    });

    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.sendFile(cachePath);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
}));

// Server-side gapless poster ("Tapete"): stitches all covers via sharp.composite().
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

router.get('/tapete', asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const maxSize = Math.min(10000, Math.max(1000, Number(req.query.maxSize || 7200)));

  const { clause, params } = buildCollectionWhere(req.query, userId, [
    'cover_url IS NOT NULL',
    "cover_url != ''"
  ]);

  const releases = db.prepare(`
    SELECT id, cover_url
    FROM releases
    ${clause}
    ORDER BY date_added DESC, artist ASC, title ASC
  `).all(...params);

  if (!releases.length) {
    return res.status(404).json({ error: 'No hay portadas en la coleccion' });
  }

  const rawTileSize = Math.floor(computeOptimalTileSize(releases.length, maxSize, maxSize));

  // Pick the best cached variant for this tile size so we never upscale
  // beyond the source resolution. If the packing wants very large tiles
  // (few items), use a higher-res variant.
  let variant = 'tapete'; // 220px
  if (rawTileSize > VARIANTS.wall.width) {
    variant = 'detail'; // 720px
  } else if (rawTileSize > VARIANTS.tapete.width) {
    variant = 'wall'; // 320px
  }

  const variantMaxPx = VARIANTS[variant].width;
  const tileSize = Math.min(rawTileSize, variantMaxPx);

  const cols = Math.max(1, Math.floor(maxSize / tileSize));
  const rows = Math.ceil(releases.length / cols);
  const canvasWidth = cols * tileSize;
  const canvasHeight = rows * tileSize;

  // Per-release: a missing cover means a hole in the mosaic, not a failure.
  const tiles = [];
  for (const release of releases) {
    try {
      const cachePath = await ensureCachedCover({ release, userId, variant });
      tiles.push(cachePath);
    } catch (error) {
      console.warn('[tapete] cover unavailable:', release.id, error.message);
      tiles.push(null);
    }
  }

  const compositeInputs = [];
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i]) continue;

    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * tileSize;
    const y = row * tileSize;

    compositeInputs.push({
      input: await sharp(tiles[i])
        .resize({ width: tileSize, height: tileSize, fit: 'cover' })
        .toBuffer(),
      left: x,
      top: y
    });
  }

  const result = await sharp({
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

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `attachment; filename="discographic-mat-${new Date().toISOString().slice(0, 10)}.jpg"`);
  res.setHeader('Cache-Control', 'no-cache');
  return res.send(result);
}));

export default router;
