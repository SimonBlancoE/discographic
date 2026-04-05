import express from 'express';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import db, { hydrateRelease } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

function buildWhere(query, userId) {
  const clauses = ['user_id = ?'];
  const params = [userId];

  if (query.search) {
    clauses.push('(artist LIKE ? OR title LIKE ?)');
    params.push(`%${query.search}%`, `%${query.search}%`);
  }
  if (query.genre) {
    clauses.push('genres LIKE ?');
    params.push(`%${query.genre}%`);
  }
  if (query.format) {
    clauses.push('formats LIKE ?');
    params.push(`%${query.format}%`);
  }
  if (query.label) {
    clauses.push('labels LIKE ?');
    params.push(`%${query.label}%`);
  }
  if (query.decade) {
    const start = Number(query.decade);
    if (Number.isFinite(start)) {
      clauses.push('year >= ? AND year < ?');
      params.push(start, start + 10);
    }
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

function serializeRelease(release, t) {
  const formats = release.formats.map((format) => format?.name || format).join(', ');
  const labels = release.labels.map((label) => label?.name || label).join(', ');

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
    [t('export.minPrice')]: release.estimated_value,
    [t('export.listingStatus')]: release.listing_status ?? '',
    [t('export.listingPrice')]: release.listing_price ?? '',
    [t('export.tracks')]: release.tracklist.map((track) => `${track.position || ''} ${track.title || ''}`.trim()).join(' | ')
  };
}

router.get('/', (req, res) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { clause, params } = buildWhere(req.query, req.session.userId);
    const rows = db.prepare(`SELECT * FROM releases ${clause} ORDER BY artist ASC, title ASC`).all(...params);
    const payload = rows.map(hydrateRelease).map((r) => serializeRelease(r, req.t));

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
    return res.status(500).json({ error: error.message });
  }
});

export default router;
