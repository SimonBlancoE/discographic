import express from 'express';
import db, { getRadarForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY } from '../services/exchangeRates.js';
import { fetchMarketplaceValue } from '../services/marketplaceValue.js';
import {
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
} from '../services/radarEnrichmentQueue.js';
import { translate } from '../../shared/i18n.js';
import {
  MARKETPLACE_STATUS,
  normalizeRadarEnrichmentStatus,
  RADAR_ENRICH_STATUS,
  type RadarEnrichmentStatus,
} from '../../shared/contracts/radar.js';

const router = express.Router();
const ENRICH_BATCH_SIZE = 30;
const enrichRunning = new Set<number>();
const enrichStates = new Map<number, MutableRadarEnrichmentState>();

type MutableRadarEnrichmentState = Omit<
  RadarEnrichmentStatus,
  'isRunning' | 'isTerminal' | 'progressPercent'
>;

type RadarEnrichInput = {
  userId: number;
  locale: string | undefined;
  discogs: Parameters<typeof fetchMarketplaceValue>[0];
};

type RadarMarketplaceValue = Awaited<ReturnType<typeof fetchMarketplaceValue>>;

router.use(requireAuth);

function radarT(locale: string | undefined, key: string, vars?: Record<string, string | number>): string {
  return translate(locale || 'es', key, vars);
}

function createIdleState(locale?: string): MutableRadarEnrichmentState {
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

function getEnrichState(userId: number, locale?: string): MutableRadarEnrichmentState {
  const current = enrichStates.get(userId);

  if (current) {
    return current;
  }

  const initial = createIdleState(locale);
  enrichStates.set(userId, initial);
  return initial;
}

function setEnrichState(userId: number, locale: string | undefined, patch: Partial<MutableRadarEnrichmentState>): void {
  enrichStates.set(userId, {
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
  if (enrichRunning.has(userId)) {
    return;
  }

  enrichRunning.add(userId);

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

    for (let offset = 0; offset < pendingRows.length && enrichRunning.has(userId); offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);

      for (const row of rows) {
        if (!enrichRunning.has(userId)) {
          break;
        }

        const marketplace = await fetchMarketplaceValue(discogs, row.release_id, DEFAULT_CURRENCY);
        const estimatedPrice = getEstimatedPrice(marketplace);

        db.prepare(`
          UPDATE radar_releases
          SET estimated_price = ?,
              marketplace_status = ?,
              marketplace_last_checked_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(
          estimatedPrice,
          marketplace.marketplaceStatus,
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
    const wasStopped = !enrichRunning.has(userId) && finalPending > 0;

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
    enrichRunning.delete(userId);
  }
}

router.get('/', (req, res) => {
  const userId = req.session.userId as number;
  res.json(getRadarForUser(userId));
});

router.post('/enrich', async (req, res) => {
  const userId = req.session.userId as number;

  if (enrichRunning.has(userId)) {
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

  enrichRunning.delete(userId);
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
