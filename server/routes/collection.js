import express from 'express';
import db, { getSettingForUser, hydrateRelease, normalizeNotes, parseJson, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertReleasePrices, normalizeCurrency } from '../services/exchangeRates.js';

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

function buildCollectionWhere(query, userId) {
  const { search = '', genre = '', style = '', decade = '', format = '', label = '' } = query;
  const clauses = ['user_id = ?'];
  const params = [userId];

  if (search) {
    clauses.push('(artist LIKE ? OR title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (genre) {
    clauses.push('genres LIKE ?');
    params.push(`%${genre}%`);
  }

  if (style) {
    clauses.push('styles LIKE ?');
    params.push(`%${style}%`);
  }

  if (decade) {
    const start = Number(decade);
    if (Number.isFinite(start)) {
      clauses.push('year >= ? AND year < ?');
      params.push(start, start + 10);
    }
  }

  if (format) {
    clauses.push('formats LIKE ?');
    params.push(`%${format}%`);
  }

  if (label) {
    clauses.push('labels LIKE ?');
    params.push(`%${label}%`);
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
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
      const name = format?.name || format;
      if (name) formats.add(name);
    }
    for (const label of parseJson(release.labels, [])) {
      const name = label?.name || label;
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
    const validSort = new Set(['artist', 'title', 'year', 'rating', 'date_added', 'estimated_value', 'listing_price_eur']);
    const sortBy = validSort.has(req.query.sortBy) ? req.query.sortBy : 'artist';
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

    return res.json({
      ...converted,
      detail_cover_url: `/api/media/cover/${release.id}?variant=detail`,
      wall_cover_url: `/api/media/cover/${release.id}?variant=wall`,
      poster_cover_url: `/api/media/cover/${release.id}?variant=poster`
    });
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
    `).all(req.session.userId).map((release) => ({
      ...release,
      genres: parseJson(release.genres, []),
      styles: parseJson(release.styles, []),
      formats: parseJson(release.formats, []),
      labels: parseJson(release.labels, []),
      detail_cover_url: `/api/media/cover/${release.id}?variant=detail`,
      wall_cover_url: `/api/media/cover/${release.id}?variant=wall`,
      poster_cover_url: `/api/media/cover/${release.id}?variant=poster`
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
    return res.json({
      ...hydrated,
      detail_cover_url: `/api/media/cover/${hydrated.id}?variant=detail`,
      wall_cover_url: `/api/media/cover/${hydrated.id}?variant=wall`,
      poster_cover_url: `/api/media/cover/${hydrated.id}?variant=poster`
    });
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

    // --- Rating ---
    const nextRating = req.body.rating !== undefined ? Number(req.body.rating) : release.rating;
    if (req.body.rating !== undefined && nextRating !== release.rating) {
      await discogs.updateRating({ ...base, rating: nextRating });
    }

    // --- Notes (custom fields) ---
    const currentNotes = parseJson(release.notes, []);
    let nextNotes = currentNotes;

    if (req.body.notes !== undefined) {
      const incomingText = String(req.body.notes || '').trim();

      // Find the "Notes" field (typically field_id 3 in Discogs).
      // If the release already has structured notes, update the last text field.
      // Otherwise create a simple entry for field 3.
      const notesFieldId = currentNotes.find((n) => n.field_id === 3)
        ? 3
        : currentNotes.length > 0
          ? currentNotes[currentNotes.length - 1].field_id || 3
          : 3;

      await discogs.updateField({
        ...base,
        fieldId: notesFieldId,
        value: incomingText
      });

      nextNotes = currentNotes.map((n) =>
        n.field_id === notesFieldId ? { ...n, value: incomingText } : n
      );

      if (!currentNotes.some((n) => n.field_id === notesFieldId)) {
        nextNotes = [...currentNotes, { field_id: notesFieldId, value: incomingText }];
      }
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
    return res.json({
      ...converted,
      detail_cover_url: `/api/media/cover/${updated.id}?variant=detail`,
      wall_cover_url: `/api/media/cover/${updated.id}?variant=wall`,
      poster_cover_url: `/api/media/cover/${updated.id}?variant=poster`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
