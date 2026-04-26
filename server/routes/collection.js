import express from 'express';
import db, { getSettingForUser, hydrateRelease, parseJson, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertReleasePrices, normalizeCurrency } from '../services/exchangeRates.js';
import { fetchMarketplaceValue } from '../services/marketplaceValue.js';
import { parseStoredNotes, replaceNoteText, resolveNoteFieldId } from '../services/notes.js';
import { buildReleaseFilterWhere, getCollectionFilterOptions } from '../services/releaseFilters.js';

const router = express.Router();

router.use(requireAuth);

const BASE_FIELDS = `
  id,
  user_id,
  release_id,
  instance_id,
  title,
  artist,
  year,
  genres,
  styles,
  formats,
  labels,
  country,
  cover_url,
  rating,
  notes,
  date_added,
  estimated_value,
  marketplace_status,
  listing_status,
  listing_price,
  listing_currency,
  listing_price_eur,
  tracklist,
  folder_id,
  raw_json,
  synced_at
`;

function getDisplayCurrency(req) {
  return normalizeCurrency(req.query.currency || getSettingForUser(req.session.userId, 'currency', DEFAULT_CURRENCY));
}

async function convertHydratedRelease(req, release) {
  return convertReleasePrices(hydrateRelease(release), getDisplayCurrency(req));
}

function attachCoverUrls(release) {
  return {
    ...release,
    detail_cover_url: `/api/media/cover/${release.id}?variant=detail`,
    wall_cover_url: `/api/media/cover/${release.id}?variant=wall`,
    poster_cover_url: `/api/media/cover/${release.id}?variant=poster`
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
  const marketplace = await fetchMarketplaceValue(discogs, release.release_id, DEFAULT_CURRENCY);

  db.prepare(`
    UPDATE releases
    SET genres = ?,
        styles = ?,
        country = ?,
        tracklist = ?,
        estimated_value = ?,
        marketplace_status = ?,
        raw_json = ?,
        synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(
    stringifyJson(detail.genres || parseJson(release.genres, [])),
    stringifyJson(detail.styles || []),
    detail.country || release.country || null,
    stringifyJson(detail.tracklist || []),
    marketplace.estimatedValue,
    marketplace.marketplaceStatus,
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
    const validSort = new Set(['artist', 'title', 'year', 'rating', 'date_added', 'estimated_value', 'listing_price_eur']);
    const sortBy = validSort.has(req.query.sortBy) ? req.query.sortBy : 'artist';
    const sortOrder = String(req.query.sortOrder || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const { clause, params } = buildReleaseFilterWhere({ userId, filters: req.query });

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
      filters: getCollectionFilterOptions(db, userId)
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

    return res.json(attachCoverUrls(converted));
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
    `).all(req.session.userId).map((release) => attachCoverUrls(hydrateRelease(release)));

    return res.json({ releases, filters: getCollectionFilterOptions(db, req.session.userId) });
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
    return res.json(attachCoverUrls(hydrated));
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

    const currentNotes = parseStoredNotes(release.notes);
    let nextNotes = currentNotes;

    if (req.body.notes !== undefined) {
      const incomingText = String(req.body.notes || '').trim();
      const notesFieldId = resolveNoteFieldId(currentNotes);

      await discogs.updateField({
        ...base,
        fieldId: notesFieldId,
        value: incomingText
      });

      nextNotes = replaceNoteText(currentNotes, incomingText, notesFieldId);
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
    return res.json(attachCoverUrls(converted));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
