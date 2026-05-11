import express, { type Response } from 'express';
import multer from 'multer';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import {
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  normalizeRadarResponse,
  type RadarLocalDecisionUpdate,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
  type RadarWantlistTemplateFormat,
} from '../../shared/contracts/radar.js';
import db, { getRadarForUser, getSettingForUser, updateRadarReleaseForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import {
  DEFAULT_CURRENCY,
  convertAmountWithRates,
  getExchangeSnapshot,
  normalizeCurrency,
} from '../services/exchangeRates.js';
import {
  getRadarUpdateRunStatus,
  startRadarUpdateRun,
  stopRadarUpdateRun,
} from '../services/radarUpdateRun.js';
import {
  RadarWantlistPreviewExpiredError,
  applyStoredRadarWantlistPreview,
  createRadarWantlistImportPreview,
} from '../services/radarWantlistImport.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const WANTLIST_TEMPLATE_BASENAME = 'discographic-radar-wantlist-template';

type Translate = (key: string) => string;
type ExchangeRates = Parameters<typeof convertAmountWithRates>[3];

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

const RADAR_PRIORITIES = new Set<RadarPriority>(Object.values(RADAR_PRIORITY));
const RADAR_MINIMUM_CONDITIONS = new Set<RadarMinimumCondition>(Object.values(RADAR_MINIMUM_CONDITION));

router.use(requireAuth);

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPreviewId(payload: unknown): string {
  const source = asRecord(payload);
  return typeof source?.previewId === 'string' ? source.previewId : '';
}

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === 0) {
    return false;
  }

  return null;
}

function isRadarPriority(value: unknown): value is RadarPriority {
  return RADAR_PRIORITIES.has(value as RadarPriority);
}

function isRadarMinimumCondition(value: unknown): value is RadarMinimumCondition {
  return RADAR_MINIMUM_CONDITIONS.has(value as RadarMinimumCondition);
}

function parseRadarPriority(value: unknown): RadarPriority {
  if (!isRadarPriority(value)) {
    throw new Error('priority is required');
  }

  return value;
}

function parseRadarMinimumCondition(value: unknown): RadarMinimumCondition | null {
  if (value == null || value === '') {
    return null;
  }

  if (!isRadarMinimumCondition(value)) {
    throw new Error('minimum_condition is invalid');
  }

  return value;
}

function parseRadarNote(value: unknown): string {
  if (value != null && typeof value !== 'string') {
    throw new Error('note must be a string');
  }

  return typeof value === 'string' ? value : '';
}

function getDisplayCurrency(userId: number): string {
  return normalizeCurrency(getSettingForUser(userId, 'currency') ?? DEFAULT_CURRENCY);
}

async function getDisplayRates(displayCurrency: string): Promise<ExchangeRates> {
  const snapshot = await getExchangeSnapshot([displayCurrency]);
  return snapshot.rates;
}

function convertNullableAmount(
  amount: number | null,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): number | null {
  return amount == null ? null : convertAmountWithRates(amount, fromCurrency, toCurrency, rates);
}

function serializeRadarRelease(
  item: RadarRelease,
  displayCurrency: string,
  rates: ExchangeRates,
): RadarRelease {
  return {
    ...item,
    local: {
      ...item.local,
      target_price: convertNullableAmount(item.local.target_price_eur, DEFAULT_CURRENCY, displayCurrency, rates),
    },
    marketplace: {
      ...item.marketplace,
      estimated_price: convertNullableAmount(item.marketplace.estimated_price, DEFAULT_CURRENCY, displayCurrency, rates),
    },
    display_currency: displayCurrency,
  };
}

async function serializeRadar(userId: number, displayCurrency = getDisplayCurrency(userId)): Promise<RadarResponse> {
  const radar = getRadarForUser(userId);
  const rates = await getDisplayRates(displayCurrency);

  return normalizeRadarResponse({
    items: radar.items.map((item) => serializeRadarRelease(item, displayCurrency, rates)),
    summary: radar.summary,
  });
}

async function serializeRadarReleaseById(
  userId: number,
  radarId: number,
  displayCurrency = getDisplayCurrency(userId),
): Promise<RadarRelease | null> {
  const radar = await serializeRadar(userId, displayCurrency);
  return radar.items.find((item) => item.id === radarId) ?? null;
}

async function parseTargetPriceEur(userId: number, value: unknown): Promise<number | null> {
  if (value == null || value === '') {
    return null;
  }

  const parsedTargetPrice = Number(value);
  if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice < 0) {
    throw new Error('target_price must be a non-negative number');
  }

  const displayCurrency = getDisplayCurrency(userId);
  const rates = await getDisplayRates(displayCurrency);
  return convertAmountWithRates(parsedTargetPrice, displayCurrency, DEFAULT_CURRENCY, rates);
}

async function parseRadarUpdatePayload(userId: number, payload: unknown): Promise<RadarLocalDecisionUpdate> {
  const source = asRecord(payload) ?? {};
  const local = asRecord(source.local) ?? source;

  const priority = parseRadarPriority(local.priority);
  const minimumCondition = parseRadarMinimumCondition(local.minimum_condition);
  const hidden = asBoolean(local.hidden);
  const resolved = asBoolean(local.resolved);
  if (hidden == null || resolved == null) {
    throw new Error('hidden and resolved are required');
  }

  const note = parseRadarNote(local.note);
  const targetPriceEur = await parseTargetPriceEur(userId, local.target_price);

  return {
    priority,
    targetPriceEur,
    minimumCondition,
    note,
    hidden,
    resolved,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    res.json(await serializeRadar(userId));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : req.t('backend.server.internal') });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    const radarId = Number(req.params.id);
    if (!Number.isInteger(radarId) || radarId < 1) {
      return res.status(400).json({ error: 'Radar release id is invalid' });
    }

    const patch = await parseRadarUpdatePayload(userId, req.body);
    const updated = updateRadarReleaseForUser(userId, radarId, patch);
    if (!updated) {
      return res.status(404).json({ error: 'Radar release not found' });
    }

    return res.json(await serializeRadar(userId));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Radar update failed' });
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

    const userId = req.session.userId as number;
    return res.json(createRadarWantlistImportPreview({
      userId,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      displayCurrency: getDisplayCurrency(userId),
      t: req.t,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : req.t('backend.server.internal');
    return res.status(400).json({ error: message });
  }
});

router.post('/wantlist/apply', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    const previewId = readPreviewId(req.body);
    if (!previewId) {
      return res.status(400).json({ error: req.t('backend.radarImport.previewIdRequired') });
    }

    const applied = await applyStoredRadarWantlistPreview({ db, userId, previewId });

    return res.json({
      ok: true,
      radar: await serializeRadar(userId),
      result: applied,
    });
  } catch (error) {
    if (error instanceof RadarWantlistPreviewExpiredError) {
      return res.status(410).json({ error: req.t('backend.radarImport.previewExpired') });
    }

    const message = error instanceof Error ? error.message : req.t('backend.server.internal');
    return res.status(500).json({ error: message });
  }
});

router.post('/update', async (req, res) => {
  const userId = req.session.userId as number;

  try {
    const discogs = getDiscogsClientForUser(req);
    const started = startRadarUpdateRun({
      db,
      userId,
      locale: req.locale,
      discogs,
      onBackgroundError: (error) => {
        console.log('[radar-update] background error:', getErrorMessage(error));
      },
    });

    if (!started) {
      return res.status(409).json({ error: req.t('backend.radar.activeUpdate') });
    }

    res.json(getRadarUpdateRunStatus(db, userId, req.locale));
  } catch (error) {
    return res.status(400).json({ error: getErrorMessage(error) });
  }
});

router.post('/update/stop', (req, res) => {
  const userId = req.session.userId as number;
  stopRadarUpdateRun(db, userId, req.locale);
  res.json(getRadarUpdateRunStatus(db, userId, req.locale));
});

router.get('/status', (req, res) => {
  const userId = req.session.userId as number;
  res.json(getRadarUpdateRunStatus(db, userId, req.locale));
});

router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    const radarId = Number(req.params.id);
    if (!Number.isInteger(radarId) || radarId < 1) {
      return res.status(400).json({ error: 'Radar release id is invalid' });
    }

    const release = await serializeRadarReleaseById(userId, radarId);
    if (!release) {
      return res.status(404).json({ error: 'Radar release not found' });
    }

    return res.json(release);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : req.t('backend.server.internal') });
  }
});

export default router;
