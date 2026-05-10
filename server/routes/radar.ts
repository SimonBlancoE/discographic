import crypto from 'crypto';
import express, { type Response } from 'express';
import multer from 'multer';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import {
  MARKETPLACE_STATUS,
  RADAR_ENRICH_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  normalizeRadarEnrichmentStatus,
  normalizeRadarResponse,
  type RadarLocalDecisionUpdate,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
  type RadarWantlistPreviewResponse,
  type RadarWantlistTemplateFormat,
} from '../../shared/contracts/radar.js';
import { translate } from '../../shared/i18n.js';
import db, { getRadarForUser, getSettingForUser, updateRadarReleaseForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import {
  DEFAULT_CURRENCY,
  convertAmountWithRates,
  getExchangeSnapshot,
  normalizeCurrency,
} from '../services/exchangeRates.js';
import { fetchMarketplaceValue } from '../services/marketplaceValue.js';
import {
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
} from '../services/radarEnrichmentQueue.js';
import {
  cleanupExpiredRadarWantlistPreviews,
  clearRadarEnrichmentRunning,
  deleteStoredRadarWantlistPreview,
  getRadarEnrichmentState as getStoredRadarEnrichmentState,
  getStoredRadarWantlistPreview,
  isRadarEnrichmentRunning,
  markRadarEnrichmentRunning,
  setRadarEnrichmentState as storeRadarEnrichmentState,
  storeRadarWantlistPreview,
} from '../services/radarRuntimeState.js';
import type {
  RadarRuntimeEnrichmentState,
  StoredRadarWantlistPreview,
} from '../services/radarRuntimeState.js';
import { getRadarAvailabilityTransition } from '../services/radarStorage.js';
import { syncRadarWantlist } from '../services/radarWantlist.js';
import { applyRadarWantlistImport, buildRadarWantlistPreview, parseRadarWantlistWorkbook } from '../services/radarWantlistImport.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const WANTLIST_TEMPLATE_BASENAME = 'discographic-radar-wantlist-template';
const ENRICH_BATCH_SIZE = 30;
const WANTLIST_PREVIEW_TTL_MS = 10 * 60 * 1000;

type Translate = (key: string) => string;
type ExchangeRates = Parameters<typeof convertAmountWithRates>[3];
type RadarEnrichInput = {
  userId: number;
  locale: string | undefined;
  discogs: Parameters<typeof fetchMarketplaceValue>[0];
};

type RadarMarketplaceValue = Awaited<ReturnType<typeof fetchMarketplaceValue>>;

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

type RadarWantlistApplyRows = Parameters<typeof applyRadarWantlistImport>[2];

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

function cleanWantlistPreviewCache(): void {
  cleanupExpiredRadarWantlistPreviews();
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

function cacheWantlistPreview(userId: number, preview: RadarWantlistPreviewResponse): string {
  cleanWantlistPreviewCache();

  const previewId = crypto.randomBytes(16).toString('hex');
  storeRadarWantlistPreview(previewId, {
    userId,
    displayCurrency: getDisplayCurrency(userId),
    preview,
    expiresAt: Date.now() + WANTLIST_PREVIEW_TTL_MS,
  });

  return previewId;
}

function getCachedWantlistPreview(previewId: string, userId: number): StoredRadarWantlistPreview | null {
  const cached = getStoredRadarWantlistPreview(previewId);

  if (!cached || cached.userId !== userId) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    deleteStoredRadarWantlistPreview(previewId);
    return null;
  }

  return cached;
}

function toRadarWantlistApplyRows(
  cached: StoredRadarWantlistPreview,
  rates: ExchangeRates,
): RadarWantlistApplyRows {
  return cached.preview.rows.map((row) => ({
    ...row,
    target_price_eur: convertNullableAmount(
      row.target_price,
      cached.displayCurrency,
      DEFAULT_CURRENCY,
      rates,
    ),
  }));
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

function radarT(locale: string | undefined, key: string, vars?: Record<string, string | number>): string {
  return translate(locale || 'es', key, vars);
}

function createIdleState(locale?: string): RadarRuntimeEnrichmentState {
  return {
    status: RADAR_ENRICH_STATUS.IDLE,
    current: 0,
    total: 0,
    pending: 0,
    message: radarT(locale, 'backend.radar.ready'),
    startedAt: null,
    finishedAt: null,
  };
}

function getEnrichState(userId: number, locale?: string): RadarRuntimeEnrichmentState {
  const current = getStoredRadarEnrichmentState(userId);

  if (current) {
    return current;
  }

  const initial = createIdleState(locale);
  storeRadarEnrichmentState(userId, initial);
  return initial;
}

function setEnrichState(
  userId: number,
  locale: string | undefined,
  patch: Partial<RadarRuntimeEnrichmentState>,
): void {
  storeRadarEnrichmentState(userId, {
    ...getEnrichState(userId, locale),
    ...patch,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function getProgressMessage(locale: string | undefined, current: number, total: number): string {
  return radarT(locale, 'backend.radar.enrichProgress', { current, total });
}

function getEstimatedPrice(marketplace: RadarMarketplaceValue): number | null {
  if (marketplace.marketplaceStatus !== MARKETPLACE_STATUS.PRICED) {
    return null;
  }

  return marketplace.estimatedValue;
}

function getCompletionMessage({
  locale,
  wasStopped,
  processed,
  pending,
}: {
  locale: string | undefined;
  wasStopped: boolean;
  processed: number;
  pending: number;
}): string {
  if (wasStopped) {
    return radarT(locale, 'backend.radar.enrichStopped', { processed, pending });
  }

  if (pending) {
    return radarT(locale, 'backend.radar.enrichRemaining', { processed, pending });
  }

  return radarT(locale, 'backend.radar.enrichDone', { processed });
}

async function runRadarEnrich({ userId, locale, discogs }: RadarEnrichInput): Promise<void> {
  if (!markRadarEnrichmentRunning(userId)) {
    return;
  }

  try {
    const pendingRows = getPendingRadarEnrichmentRows(db, userId);
    const totalPending = pendingRows.length;

    if (!totalPending) {
      setEnrichState(userId, locale, {
        status: RADAR_ENRICH_STATUS.IDLE,
        current: 0,
        total: 0,
        pending: 0,
        message: radarT(locale, 'backend.radar.completeSet'),
        startedAt: null,
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    let processed = 0;

    setEnrichState(userId, locale, {
      status: RADAR_ENRICH_STATUS.RUNNING,
      current: 0,
      total: totalPending,
      pending: totalPending,
      message: getProgressMessage(locale, 0, totalPending),
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });

    for (let offset = 0; offset < pendingRows.length && isRadarEnrichmentRunning(userId); offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);

      for (const row of rows) {
        if (!isRadarEnrichmentRunning(userId)) {
          break;
        }

        const marketplace = await fetchMarketplaceValue(discogs, row.release_id, DEFAULT_CURRENCY);
        const estimatedPrice = getEstimatedPrice(marketplace);
        const availabilityTransition = getRadarAvailabilityTransition(
          row.marketplace_status,
          marketplace.marketplaceStatus,
        );

        db.prepare(`
          UPDATE radar_releases
          SET estimated_price = ?,
              marketplace_status = ?,
              marketplace_last_checked_at = CURRENT_TIMESTAMP,
              marketplace_last_unavailable_at = CASE
                WHEN ? = 1 THEN CURRENT_TIMESTAMP
                ELSE marketplace_last_unavailable_at
              END,
              marketplace_available_again_at = CASE
                WHEN ? = 1 THEN CURRENT_TIMESTAMP
                WHEN ? = 1 THEN NULL
                ELSE marketplace_available_again_at
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(
          estimatedPrice,
          marketplace.marketplaceStatus,
          availabilityTransition.markUnavailableNow ? 1 : 0,
          availabilityTransition.markAvailableAgainNow ? 1 : 0,
          availabilityTransition.clearAvailableAgain ? 1 : 0,
          row.id,
          userId,
        );

        processed += 1;
        setEnrichState(userId, locale, {
          status: RADAR_ENRICH_STATUS.RUNNING,
          current: processed,
          total: totalPending,
          message: getProgressMessage(locale, processed, totalPending),
        });
      }
    }

    const finalPending = getPendingRadarEnrichmentCount(db, userId);
    const wasStopped = !isRadarEnrichmentRunning(userId) && finalPending > 0;

    setEnrichState(userId, locale, {
      status: wasStopped ? RADAR_ENRICH_STATUS.STOPPED : RADAR_ENRICH_STATUS.COMPLETED,
      current: processed,
      total: totalPending,
      pending: finalPending,
      message: getCompletionMessage({
        locale,
        wasStopped,
        processed,
        pending: finalPending,
      }),
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    setEnrichState(userId, locale, {
      status: RADAR_ENRICH_STATUS.FAILED,
      message: getErrorMessage(error),
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearRadarEnrichmentRunning(userId);
  }
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

router.post('/sync', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    const discogs = getDiscogsClientForUser(req);
    const wantlistRows = await discogs.getAllWantlist();
    const result = syncRadarWantlist(db, userId, wantlistRows);

    return res.json({
      radar: await serializeRadar(userId),
      result,
    });
  } catch (error) {
    return next(error);
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
    const preview = buildRadarWantlistPreview(rows, req.t);

    if (preview.summary.validRows === 0) {
      return res.json(preview);
    }

    const userId = req.session.userId as number;
    const previewId = cacheWantlistPreview(userId, preview);

    return res.json({
      ...preview,
      previewId,
    });
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

    const cached = getCachedWantlistPreview(previewId, userId);
    if (!cached) {
      return res.status(410).json({ error: req.t('backend.radarImport.previewExpired') });
    }

    deleteStoredRadarWantlistPreview(previewId);

    const rates = await getDisplayRates(cached.displayCurrency);
    const applied = applyRadarWantlistImport(db, userId, toRadarWantlistApplyRows(cached, rates));

    return res.json({
      ok: true,
      radar: await serializeRadar(userId),
      result: {
        totalRows: cached.preview.summary.totalRows,
        imported: applied.imported,
        skipped: cached.preview.summary.invalidRows,
        added: applied.added,
        updated: applied.updated,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : req.t('backend.server.internal');
    return res.status(500).json({ error: message });
  }
});

router.post('/enrich', async (req, res) => {
  const userId = req.session.userId as number;

  if (isRadarEnrichmentRunning(userId)) {
    return res.status(409).json({ error: req.t('backend.radar.activeEnrich') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    res.json({ ok: true });

    runRadarEnrich({ userId, locale: req.locale, discogs }).catch((error) => {
      console.log('[radar-enrich] background error:', getErrorMessage(error));
    });
  } catch (error) {
    return res.status(400).json({ error: getErrorMessage(error) });
  }
});

router.post('/enrich/stop', (req, res) => {
  const userId = req.session.userId as number;
  const pending = getPendingRadarEnrichmentCount(db, userId);
  const currentState = getEnrichState(userId, req.locale);

  clearRadarEnrichmentRunning(userId);
  setEnrichState(userId, req.locale, {
    status: RADAR_ENRICH_STATUS.STOPPED,
    pending,
    message: radarT(req.locale, 'backend.radar.enrichStopped', {
      processed: currentState.current,
      pending,
    }),
    finishedAt: new Date().toISOString(),
  });

  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const userId = req.session.userId as number;
  const state = getEnrichState(userId, req.locale);
  const pending = getPendingRadarEnrichmentCount(db, userId);

  res.json(normalizeRadarEnrichmentStatus({
    ...state,
    pending,
    message: state.message || radarT(req.locale, 'backend.radar.ready'),
  }));
});

export default router;
