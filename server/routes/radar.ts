import express, { type Response } from 'express';
import multer from 'multer';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import db, { getRadarForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { syncRadarWantlist } from '../services/radarWantlist.js';
import { buildRadarWantlistPreview, parseRadarWantlistWorkbook } from '../services/radarWantlistImport.js';
import type { RadarWantlistTemplateFormat } from '../../shared/contracts/radar.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const WANTLIST_TEMPLATE_BASENAME = 'discographic-radar-wantlist-template';

type Translate = (key: string) => string;

type WantlistTemplateRow = {
  release_id: number;
  artist: string;
  title: string;
  year: number;
  notes: string;
  date_added: string;
  target_price: number;
  minimum_condition: string;
  priority: string;
};

function buildWantlistTemplateData(t: Translate): WantlistTemplateRow[] {
  return [
    {
      release_id: 12231071,
      artist: t('backend.radarImport.templateArtistSample'),
      title: t('backend.radarImport.templateTitleSample'),
      year: 1980,
      notes: t('backend.radarImport.templateNotesSample'),
      date_added: '2026-05-10',
      target_price: 18,
      minimum_condition: 'VG+',
      priority: 'high',
    },
  ];
}

function sendCsvTemplate(res: Response, data: WantlistTemplateRow[]) {
  const csv = stringify(data, { header: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${WANTLIST_TEMPLATE_BASENAME}.csv"`);
  res.send(`\uFEFF${csv}`);
}

function sendXlsxTemplate(res: Response, data: WantlistTemplateRow[], sheetName: string) {
  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${WANTLIST_TEMPLATE_BASENAME}.xlsx"`);
  res.send(buffer);
}

function resolveTemplateFormat(format: unknown): RadarWantlistTemplateFormat {
  return format === 'csv' ? 'csv' : 'xlsx';
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const userId = req.session.userId as number;
  res.json(getRadarForUser(userId));
});

router.post('/sync', async (req, res, next) => {
  try {
    const userId = req.session.userId as number;
    const discogs = getDiscogsClientForUser(req);
    const wantlistRows = await discogs.getAllWantlist();
    const result = syncRadarWantlist(db, userId, wantlistRows);

    res.json({
      radar: getRadarForUser(userId),
      result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/wantlist/template', (req, res) => {
  const format = resolveTemplateFormat(req.query.format);
  const data = buildWantlistTemplateData(req.t);

  if (format === 'csv') {
    sendCsvTemplate(res, data);
    return;
  }

  sendXlsxTemplate(res, data, req.t('backend.radarImport.templateSheetName'));
});

router.post('/wantlist/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: req.t('backend.radarImport.fileRequired') });
    }

    const rows = parseRadarWantlistWorkbook(req.file.buffer, req.file.originalname, req.t);
    return res.json(buildRadarWantlistPreview(rows, req.t));
  } catch (error) {
    const message = error instanceof Error ? error.message : req.t('backend.server.internal');
    return res.status(400).json({ error: message });
  }
});

export default router;
