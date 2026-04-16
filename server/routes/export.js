import express from 'express';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import db, { hydrateRelease } from '../db.js';
import { pickName } from '../../shared/discogs.js';
import { buildCollectionWhere } from '../lib/collectionFilters.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertAmount, normalizeCurrency } from '../services/exchangeRates.js';

const router = express.Router();

router.use(requireAuth);

async function serializeRelease(release, t, currency) {
  const formats = release.formats.map(pickName).join(', ');
  const labels = release.labels.map(pickName).join(', ');

  return {
    [t('export.id')]: release.id,
    [t('export.releaseDiscogs')]: release.release_id,
    [t('export.instance')]: release.instance_id,
    [t('export.artist')]: release.artist,
    [t('export.title')]: release.title,
    [t('export.year')]: release.year,
    [t('export.genres')]: release.genres.join(', '),
    [t('export.styles')]: release.styles.join(', '),
    [t('export.formats')]: formats,
    [t('export.labels')]: labels,
    [t('export.country')]: release.country,
    [t('export.rating')]: release.rating,
    [t('export.notes')]: release.notes_text,
    [t('export.dateAdded')]: release.date_added,
    [t('export.minPrice')]: await convertAmount(release.estimated_value, DEFAULT_CURRENCY, currency),
    [t('export.listingStatus')]: release.listing_status ?? '',
    [t('export.listingPrice')]: release.listing_price_eur == null ? '' : await convertAmount(release.listing_price_eur, DEFAULT_CURRENCY, currency),
    [t('export.tracks')]: release.tracklist.map((track) => `${track.position || ''} ${track.title || ''}`.trim()).join(' | ')
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const currency = normalizeCurrency(req.query.currency || DEFAULT_CURRENCY);
  const { clause, params } = buildCollectionWhere(req.query, req.session.userId);
  const rows = db.prepare(`SELECT * FROM releases ${clause} ORDER BY artist ASC, title ASC`).all(...params);
  const payload = await Promise.all(rows.map(hydrateRelease).map((release) => serializeRelease(release, req.t, currency)));

  if (format === 'xlsx') {
    const sheet = XLSX.utils.json_to_sheet(payload);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, req.t('export.sheetName'));
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="discographic-collection.xlsx"');
    return res.send(buffer);
  }

  const csv = stringify(payload, { header: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="discographic-collection.csv"');
  return res.send(`\uFEFF${csv}`);
}));

export default router;
