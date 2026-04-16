import express from 'express';
import db, { getSettingForUser, hydrateRelease, normalizeNotes, parseJson, stringifyJson, withCoverUrls } from '../db.js';
import { pickName } from '../../shared/discogs.js';
import { RELEASE_BASE_FIELDS } from '../../shared/release.js';
import { isValidSortColumn } from '../../shared/releaseSort.js';
import { PREFERENCE_KEYS } from '../../shared/preferences.js';
import { buildCollectionWhere } from '../lib/collectionFilters.js';
import { resolveNotesFieldId, upsertNote } from '../lib/discogsNotes.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertReleasePrices, normalizeCurrency } from '../services/exchangeRates.js';

const router = express.Router();

router.use(requireAuth);

const BASE_FIELDS = RELEASE_BASE_FIELDS;

function getDisplayCurrency(req) {
  return normalizeCurrency(req.query.currency || getSettingForUser(req.session.userId, PREFERENCE_KEYS.CURRENCY, DEFAULT_CURRENCY));
}

async function convertHydratedRelease(req, release) {
  return convertReleasePrices(hydrateRelease(release), getDisplayCurrency(req));
}

function getFilterOptions(userId) {
  const releases = db.prepare('SELECT genres, styles, formats, labels, year FROM releases WHERE user_id = ?').all(userId);
  const genres = new Set();
  const styles = new Set();
  const formats = new Set();
  const labels = new Set();
  const decades = new Set();

  for (const release of releases) {
    for (const genre of parseJson(release.genres, [])) {
      if (genre) genres.add(genre);
    }
    for (const style of parseJson(release.styles, [])) {
      if (style) styles.add(style);
    }
    for (const format of parseJson(release.formats, [])) {
      const name = pickName(format);
      if (name) formats.add(name);
    }
    for (const label of parseJson(release.labels, [])) {
      const name = pickName(label);
      if (name) labels.add(name);
    }
    if (release.year) {
      decades.add(Math.floor(release.year / 10) * 10);
    }
  }

  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    styles: [...styles].sort((a, b) => a.localeCompare(b)),
    decades: [...decades].sort((a, b) => a - b),
    formats: [...formats].sort((a, b) => a.localeCompare(b)),
    labels: [...labels].sort((a, b) => a.localeCompare(b)).slice(0, 100)
  };
}

async function enrichReleaseIfNeeded(req, release) {
  if (!release) {
    return null;
  }

  // Only fetch detail if we've never enriched this release before.
  // tracklist stays '[]' until we call /releases/:id for the first time.
  const neverEnriched = !release.tracklist || release.tracklist === '[]';
  if (!neverEnriched) {
    return convertHydratedRelease(req, release);
  }

  let discogs;
  try {
    discogs = getDiscogsClientForUser(req);
  } catch {
    return convertHydratedRelease(req, release);
  }
  const detail = await discogs.getRelease(release.release_id);
  const stats = await discogs.getMarketplaceStats(release.release_id, DEFAULT_CURRENCY).catch(() => null);
  const priceEur = stats?.lowest_price?.value ?? 0;

  db.prepare(`
    UPDATE releases
    SET genres = ?,
        styles = ?,
        country = ?,
        tracklist = ?,
        estimated_value = ?,
        raw_json = ?,
        synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(
    stringifyJson(detail.genres || parseJson(release.genres, [])),
    stringifyJson(detail.styles || []),
    detail.country || release.country || null,
    stringifyJson(detail.tracklist || []),
    priceEur,
    JSON.stringify(detail),
    release.id,
    req.session.userId
  );

  const fresh = db.prepare(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(release.id, req.session.userId);
  return convertHydratedRelease(req, fresh);
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const sortBy = isValidSortColumn(req.query.sortBy) ? req.query.sortBy : 'artist';
    const sortOrder = String(req.query.sortOrder || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const { clause, params } = buildCollectionWhere(req.query, userId);

    const total = db.prepare(`SELECT COUNT(*) AS count FROM releases ${clause}`).get(...params).count;
    const rawReleases = db.prepare(`
      SELECT ${BASE_FIELDS}
      FROM releases
      ${clause}
      ORDER BY ${sortBy} ${sortOrder}, artist ASC, title ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const releases = await Promise.all(rawReleases.map((release) => convertHydratedRelease(req, release)));

    res.json({
      releases,
      displayCurrency: getDisplayCurrency(req),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      filters: getFilterOptions(userId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/random', async (req, res) => {
  try {
    const release = db.prepare(`
      SELECT ${BASE_FIELDS}
      FROM releases
      WHERE user_id = ?
      ORDER BY RANDOM()
      LIMIT 1
    `).get(req.session.userId);

    if (!release) {
      return res.status(404).json({ error: 'No hay discos en la coleccion todavia' });
    }

    const converted = await convertHydratedRelease(req, release);

    return res.json(withCoverUrls(converted));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/covers', (req, res) => {
  try {
    const releases = db.prepare(`
      SELECT id, release_id, title, artist, year, genres, styles, formats, labels, cover_url
      FROM releases
      WHERE user_id = ?
      ORDER BY date_added DESC, artist ASC, title ASC
    `).all(req.session.userId).map((release) => withCoverUrls({
      ...release,
      genres: parseJson(release.genres, []),
      styles: parseJson(release.styles, []),
      formats: parseJson(release.formats, []),
      labels: parseJson(release.labels, [])
    }));

    return res.json({ releases, filters: getFilterOptions(req.session.userId) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const release = db.prepare(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(req.params.id, req.session.userId);

    if (!release) {
      return res.status(404).json({ error: 'Release no encontrado' });
    }

    const hydrated = await enrichReleaseIfNeeded(req, release);
    return res.json(withCoverUrls(hydrated));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const release = db.prepare(`
      SELECT id, user_id, release_id, instance_id, folder_id, notes, rating
      FROM releases
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.session.userId);

    if (!release) {
      return res.status(404).json({ error: 'Release no encontrado' });
    }

    const discogs = getDiscogsClientForUser(req);
    const base = {
      folderId: release.folder_id || 0,
      releaseId: release.release_id,
      instanceId: release.instance_id
    };

    const nextRating = req.body.rating !== undefined ? Number(req.body.rating) : release.rating;
    if (req.body.rating !== undefined && nextRating !== release.rating) {
      await discogs.updateRating({ ...base, rating: nextRating });
    }

    const currentNotes = parseJson(release.notes, []);
    let nextNotes = currentNotes;

    if (req.body.notes !== undefined) {
      const incomingText = String(req.body.notes || '').trim();
      const notesFieldId = resolveNotesFieldId(currentNotes);

      await discogs.updateField({
        ...base,
        fieldId: notesFieldId,
        value: incomingText
      });

      nextNotes = upsertNote(currentNotes, notesFieldId, incomingText);
    }

    db.prepare(`
      UPDATE releases
      SET rating = ?,
          notes = ?,
          synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(nextRating, stringifyJson(nextNotes), req.params.id, req.session.userId);

    const updated = db.prepare(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(req.params.id, req.session.userId);
    const converted = await convertHydratedRelease(req, updated);
    return res.json(withCoverUrls(converted));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
