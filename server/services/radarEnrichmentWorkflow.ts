import type Database from 'better-sqlite3';
import {
  MARKETPLACE_STATUS,
  RADAR_ENRICH_STATUS,
  normalizeRadarEnrichmentStatus,
  type RadarEnrichmentStatus,
} from '../../shared/contracts/radar.js';
import { translate } from '../../shared/i18n.js';
import { DEFAULT_CURRENCY } from './exchangeRates.js';
import { fetchMarketplaceValue } from './marketplaceValue.js';
import {
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
} from './radarEnrichmentQueue.js';
import {
  clearRadarEnrichmentRunning,
  getRadarEnrichmentState,
  isRadarEnrichmentRunning,
  markRadarEnrichmentRunning,
  setRadarEnrichmentState,
  type RadarRuntimeEnrichmentState,
} from './radarRuntimeState.js';
import { getRadarAvailabilityTransition } from './radarStorage.js';

const ENRICH_BATCH_SIZE = 30;

type RadarMarketplaceValue = Awaited<ReturnType<typeof fetchMarketplaceValue>>;
type DiscogsClient = Parameters<typeof fetchMarketplaceValue>[0];

type RadarEnrichmentInput = {
  db: Database.Database;
  userId: number;
  locale: string | undefined;
  discogs: DiscogsClient;
  onBackgroundError?: (error: unknown) => void;
};

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

function getStoredOrIdleState(userId: number, locale?: string): RadarRuntimeEnrichmentState {
  const current = getRadarEnrichmentState(userId);

  if (current) {
    return current;
  }

  const initial = createIdleState(locale);
  setRadarEnrichmentState(userId, initial);
  return initial;
}

function setEnrichmentState(
  userId: number,
  locale: string | undefined,
  patch: Partial<RadarRuntimeEnrichmentState>,
): void {
  setRadarEnrichmentState(userId, {
    ...getStoredOrIdleState(userId, locale),
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

function updateRadarMarketplaceValue(
  db: Database.Database,
  userId: number,
  row: { id: number; marketplace_status: string; release_id: number },
  marketplace: RadarMarketplaceValue,
): void {
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
}

async function runClaimedRadarEnrichment({
  db,
  userId,
  locale,
  discogs,
}: RadarEnrichmentInput): Promise<void> {
  try {
    const pendingRows = getPendingRadarEnrichmentRows(db, userId);
    const totalPending = pendingRows.length;

    if (!totalPending) {
      setEnrichmentState(userId, locale, {
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

    setEnrichmentState(userId, locale, {
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
        updateRadarMarketplaceValue(db, userId, row, marketplace);

        processed += 1;
        setEnrichmentState(userId, locale, {
          status: RADAR_ENRICH_STATUS.RUNNING,
          current: processed,
          total: totalPending,
          message: getProgressMessage(locale, processed, totalPending),
        });
      }
    }

    const finalPending = getPendingRadarEnrichmentCount(db, userId);
    const wasStopped = !isRadarEnrichmentRunning(userId) && finalPending > 0;

    setEnrichmentState(userId, locale, {
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
    setEnrichmentState(userId, locale, {
      status: RADAR_ENRICH_STATUS.FAILED,
      message: getErrorMessage(error),
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearRadarEnrichmentRunning(userId);
  }
}

export function startRadarEnrichment(input: RadarEnrichmentInput): boolean {
  if (!markRadarEnrichmentRunning(input.userId)) {
    return false;
  }

  runClaimedRadarEnrichment(input).catch((error) => {
    input.onBackgroundError?.(error);
  });

  return true;
}

export function stopRadarEnrichment(
  db: Database.Database,
  userId: number,
  locale: string | undefined,
): void {
  const pending = getPendingRadarEnrichmentCount(db, userId);
  const currentState = getStoredOrIdleState(userId, locale);

  clearRadarEnrichmentRunning(userId);
  setEnrichmentState(userId, locale, {
    status: RADAR_ENRICH_STATUS.STOPPED,
    pending,
    message: radarT(locale, 'backend.radar.enrichStopped', {
      processed: currentState.current,
      pending,
    }),
    finishedAt: new Date().toISOString(),
  });
}

export function getRadarEnrichmentStatus(
  db: Database.Database,
  userId: number,
  locale: string | undefined,
): RadarEnrichmentStatus {
  const state = getStoredOrIdleState(userId, locale);
  const pending = getPendingRadarEnrichmentCount(db, userId);

  return normalizeRadarEnrichmentStatus({
    ...state,
    pending,
    message: state.message || radarT(locale, 'backend.radar.ready'),
  });
}
