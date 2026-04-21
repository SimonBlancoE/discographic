import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  ensureCachedCover,
  fetchRemoteImage,
  generateTapeteImage,
  isAllowedRemoteImageUrl
} from '../services/coverMedia.js';
import { buildReleaseFilterWhere } from '../services/releaseFilters.js';

const router = express.Router();

router.use(requireAuth);

router.get('/proxy-image', async (req, res) => {
  const target = String(req.query.url || '');

  if (!target || !isAllowedRemoteImageUrl(target)) {
    return res.status(400).json({ error: req.t('backend.media.urlNotAllowed') });
  }

  try {
    const { contentType, buffer } = await fetchRemoteImage(target);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch {
    return res.status(502).json({ error: req.t('backend.media.remoteFetchFailed') });
  }
});

router.get('/cover/:id', async (req, res) => {
  const release = db.prepare(`
    SELECT id, cover_url
    FROM releases
    WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.session.userId);

  if (!release) {
    return res.status(404).json({ error: req.t('backend.media.releaseNotFound') });
  }

  try {
    const variant = String(req.query.variant || 'wall');
    const cachePath = await ensureCachedCover({
      release,
      userId: req.session.userId,
      variant,
      t: req.t
    });

    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.sendFile(cachePath);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
});

router.get('/tapete', async (req, res) => {
  const userId = req.session.userId;
  const maxSize = Math.min(10000, Math.max(1000, Number(req.query.maxSize || 7200)));
  const { clause, params } = buildReleaseFilterWhere({
    userId,
    filters: req.query,
    baseClauses: ["cover_url IS NOT NULL", "cover_url != ''"]
  });

  const releases = db.prepare(`
    SELECT id, cover_url
    FROM releases
    ${clause}
    ORDER BY date_added DESC, artist ASC, title ASC
  `).all(...params);

  if (!releases.length) {
    return res.status(404).json({ error: req.t('backend.media.noCovers') });
  }

  try {
    const result = await generateTapeteImage({ releases, userId, maxSize });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="discographic-mat-${new Date().toISOString().slice(0, 10)}.jpg"`);
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(result);
  } catch (error) {
    console.log('[tapete] error:', error.message);
    return res.status(500).json({ error: req.t('backend.media.tapeteFailed', { error: error.message }) });
  }
});

export default router;
