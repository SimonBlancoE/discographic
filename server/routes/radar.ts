import express from 'express';
import multer from 'multer';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { getRadarForUser } from '../db.js';
import { buildRadarWantlistPreview, parseRadarWantlistWorkbook } from '../services/radarWantlistImport.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getRadarForUser(req.session.userId));
});

router.get('/wantlist/template', (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const data = [
    {
      release_id: 12231071,
      artist: req.t('backend.radarImport.templateArtistSample'),
      title: req.t('backend.radarImport.templateTitleSample'),
      year: 1980,
      notes: req.t('backend.radarImport.templateNotesSample'),
      date_added: '2026-05-10',
      target_price: 18,
      minimum_condition: 'VG+',
      priority: 'high',
    },
  ];

  if (format === 'csv') {
    const csv = stringify(data, { header: true });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="discographic-radar-wantlist-template.csv"');
    res.send(`\uFEFF${csv}`);
    return;
  }

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, req.t('backend.radarImport.templateSheetName'));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="discographic-radar-wantlist-template.xlsx"');
  res.send(buffer);
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
