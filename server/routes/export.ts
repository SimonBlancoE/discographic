import type { ReleaseRow } from '../db.js';
import { errorMessage } from '../services/errors.js';
import express, { type Request } from 'express';
import { record } from '../discogsPagination.js';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import db, { getCollectionFieldMap, hydrateRelease } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertAmountWithRates, getExchangeSnapshot, normalizeCurrency } from '../services/exchangeRates.js';
import { buildReleaseFilterWhere } from '../services/releaseFilters.js';

const router = express.Router();

// All handlers below run after requireAuth verifies userId and the current auth epoch.
router.use(requireAuth);

// Cells starting with these characters are evaluated as formulas by Excel/LibreOffice.
// Titles and labels come from community-edited Discogs data, so they are neutralized.
function neutralizeFormula(value: unknown) {
  // "+"/"-" only count when followed by something formula-like, so artists such as "-M-" stay intact.
  return typeof value === 'string' && /^(=|@|\t|\r|[+-]\s*[\d(=])/.test(value) ? `'${value}` : value;
}

function neutralizeRow(row: Record<string, unknown>, editableKeys: Set<string>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, editableKeys.has(key) ? value : neutralizeFormula(value)]));
}

function serializeRelease(release: NonNullable<ReturnType<typeof hydrateRelease<ReleaseRow>>>, t: Request['t'], currency: string, rates: Awaited<ReturnType<typeof getExchangeSnapshot>>['rates']) {
  const formats = release.formats.map((format) => record(format)?.name || format).join(', ');
  const labels = release.labels.map((label) => record(label)?.name || label).join(', ');

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
    [t('export.mediaCondition')]: release.media_condition ?? '',
    [t('export.sleeveCondition')]: release.sleeve_condition ?? '',
    [t('export.dateAdded')]: release.date_added,
    [t('export.minPrice')]: convertAmountWithRates(release.estimated_value, DEFAULT_CURRENCY, currency, rates),
    [t('export.listingStatus')]: release.listing_status ?? '',
    [t('export.listingPrice')]: release.listing_price_eur == null ? '' : convertAmountWithRates(release.listing_price_eur, DEFAULT_CURRENCY, currency, rates),
    [t('export.tracks')]: release.tracklist.map((track) => `${record(track)?.position || ''} ${record(track)?.title || ''}`.trim()).join(' | ')
  };
}

router.get('/', async (req, res) => {
  try {
    // The file type travels as `type`: `format` is the collection filter (Vinyl, CD...), and sharing the
    // name made filtered exports ignore the chosen file type.
    const format = req.query.type === 'xlsx' ? 'xlsx' : 'csv';
    const currency = normalizeCurrency(req.query.currency || DEFAULT_CURRENCY);
    const { clause, params } = buildReleaseFilterWhere({
      userId: req.session.userId!,
      filters: req.query,
      mediaFieldId: getCollectionFieldMap(req.session.userId!).mediaFieldId
    });
    const rows = db.prepare<unknown[], ReleaseRow>(`SELECT * FROM releases ${clause} ORDER BY artist ASC, title ASC`).all(...params);
    const snapshot = await getExchangeSnapshot([currency]);
    // Notes round-trip through the import workflow, so the user's own text is exported verbatim.
    const editableKeys = new Set([req.t('export.notes')]);
    const payload = rows
      .map(row => hydrateRelease(row))
      .map((release) => neutralizeRow(serializeRelease(release, req.t, currency, snapshot.rates), editableKeys));

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
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

export default router;
