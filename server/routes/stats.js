import express from 'express';
import db, { getSettingForUser, parseJson } from '../db.js';
import { pickName } from '../../shared/discogs.js';
import { PREFERENCE_KEYS } from '../../shared/preferences.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertAmount, normalizeCurrency } from '../services/exchangeRates.js';

const router = express.Router();

router.use(requireAuth);

function countJsonValues(rows, mapValue) {
  const counts = new Map();

  for (const row of rows) {
    const entries = parseJson(row.value, []);
    for (const entry of entries) {
      const name = mapValue(entry);
      if (!name) {
        continue;
      }
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const displayCurrency = normalizeCurrency(req.query.currency || getSettingForUser(userId, PREFERENCE_KEYS.CURRENCY, DEFAULT_CURRENCY));
  const totalRecords = db.prepare('SELECT COUNT(*) AS count FROM releases WHERE user_id = ?').get(userId).count;
  const ratedRecords = db.prepare('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND rating > 0').get(userId).count;
  const notesRecords = db.prepare(`
    SELECT COUNT(*) AS count
    FROM releases
    WHERE user_id = ? AND notes IS NOT NULL AND notes != '[]'
  `).get(userId).count;
  const pricedRecords = db.prepare(`
    SELECT COUNT(*) AS count
    FROM releases
    WHERE user_id = ? AND estimated_value IS NOT NULL AND estimated_value > 0
  `).get(userId).count;
  const totalValueEur = db.prepare(`
    SELECT COALESCE(SUM(estimated_value), 0) AS total
    FROM releases
    WHERE user_id = ? AND estimated_value IS NOT NULL AND estimated_value > 0
  `).get(userId).total;

  const genres = countJsonValues(
    db.prepare('SELECT genres AS value FROM releases WHERE user_id = ? AND genres IS NOT NULL').all(userId),
    (entry) => entry
  );

  const formats = countJsonValues(
    db.prepare('SELECT formats AS value FROM releases WHERE user_id = ? AND formats IS NOT NULL').all(userId),
    pickName
  );

  const labels = countJsonValues(
    db.prepare('SELECT labels AS value FROM releases WHERE user_id = ? AND labels IS NOT NULL').all(userId),
    pickName
  ).slice(0, 20);

  const decades = db.prepare(`
    SELECT printf('%ds', (CAST(year / 10 AS INTEGER) * 10)) AS name, COUNT(*) AS count
    FROM releases
    WHERE user_id = ? AND year IS NOT NULL AND year > 0
    GROUP BY CAST(year / 10 AS INTEGER)
    ORDER BY CAST(year / 10 AS INTEGER)
  `).all(userId);

  const styles = countJsonValues(
    db.prepare('SELECT styles AS value FROM releases WHERE user_id = ? AND styles IS NOT NULL').all(userId),
    (entry) => entry
  ).slice(0, 15);

  const growth = db.prepare(`
    SELECT substr(date_added, 1, 7) AS month, COUNT(*) AS count
    FROM releases
    WHERE user_id = ? AND date_added IS NOT NULL AND date_added != ''
    GROUP BY substr(date_added, 1, 7)
    ORDER BY month ASC
  `).all(userId);

  const topValue = db.prepare(`
    SELECT id, release_id, artist, title, year, cover_url, estimated_value
    FROM releases
    WHERE user_id = ? AND estimated_value IS NOT NULL
    ORDER BY estimated_value DESC, artist ASC
    LIMIT 10
  `).all(userId);

  const artists = db.prepare(`
    SELECT artist, COUNT(*) AS count
    FROM releases
    WHERE user_id = ?
    GROUP BY artist
    ORDER BY count DESC, artist ASC
    LIMIT 20
  `).all(userId);

  const lastSync = db.prepare(`
    SELECT started_at, finished_at, records_synced, status
    FROM sync_log
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);

  res.json({
    totals: {
      total_records: totalRecords,
      total_value: await convertAmount(totalValueEur, DEFAULT_CURRENCY, displayCurrency),
      rated_records: ratedRecords,
      notes_records: notesRecords,
      priced_records: pricedRecords
    },
    genres: genres.slice(0, 12),
    decades,
    formats,
    labels,
    styles,
    growth,
    topValue: await Promise.all(topValue.map(async (release) => ({
      ...release,
      estimated_value: await convertAmount(release.estimated_value, DEFAULT_CURRENCY, displayCurrency)
    }))),
    artists,
    lastSync,
    displayCurrency
  });
}));

export default router;
