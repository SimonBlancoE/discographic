import type Database from 'better-sqlite3';
import {
  MARKETPLACE_STATUS,
  RADAR_UPDATE_RUN_PHASE,
  normalizeRadarUpdateRunStatus,
  type RadarSyncResult,
  type RadarUpdateRunStatus,
} from '../../shared/contracts/radar.js';
import { translate } from '../../shared/i18n.js';
import { DEFAULT_CURRENCY } from './exchangeRates.js';
import { fetchMarketplaceValue } from './marketplaceValue.js';
import {
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
} from './radarEnrichmentQueue.js';
import {
  clearRadarUpdateRunRunning,
  getRadarUpdateRunState,
  isRadarUpdateRunRunning,
  markRadarUpdateRunRunning,
  setRadarUpdateRunState,
  type RadarRuntimeUpdateRunState,
} from './radarRuntimeState.js';
import { getRadarAvailabilityTransition } from './radarStorage.js';
import { syncRadarWantlist } from './radarWantlist.js';

const ENRICH_BATCH_SIZE = 30;

type RadarMarketplaceValue = Awaited<ReturnType<typeof fetchMarketplaceValue>>;
type MarketplaceClient = Parameters<typeof fetchMarketplaceValue>[0];
type DiscogsClient = MarketplaceClient & {
  getAllWantlist: () => Promise<unknown[]>;
};

type RadarUpdateRunInput = {
  db: Database.Database;
  userId: number;
  locale: string | undefined;
  discogs: DiscogsClient;
  onBackgroundError?: (error: unknown) => void;
};

function radarT(locale: string | undefined, key: string, vars?: Record<string, string | number>): string {
  return translate(locale || 'es', key, vars);
}

function createEmptyWantlistResult(): RadarSyncResult {
  return {
    totalFetched: 0,
    added: 0,
    updated: 0,
    reactivated: 0,
    markedMissing: 0,
    ignored: 0,
  };
}

function createIdleState(locale?: string): RadarRuntimeUpdateRunState {
  return {
    phase: RADAR_UPDATE_RUN_PHASE.IDLE,
    current: 0,
    total: 0,
    pending: 0,
    message: radarT(locale, 'backend.radar.ready'),
    startedAt: null,
    finishedAt: null,
    wantlist: createEmptyWantlistResult(),
  };
}

function getStoredOrIdleState(userId: number, locale?: string): RadarRuntimeUpdateRunState {
  const current = getRadarUpdateRunState(userId);

  if (current) {
    return current;
  }

  const initial = createIdleState(locale);
  setRadarUpdateRunState(userId, initial);
  return initial;
}

function setUpdateRunState(
  userId: number,
  locale: string | undefined,
  patch: Partial<RadarRuntimeUpdateRunState>,
): RadarRuntimeUpdateRunState {
  return setRadarUpdateRunState(userId, {
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

function getReviewingMessage(locale: string | undefined, current: number, total: number): string {
  return radarT(locale, 'backend.radar.updateReviewing', { current, total });
}

function getEstimatedPrice(marketplace: RadarMarketplaceValue): number | null {
  if (marketplace.marketplaceStatus !== MARKETPLACE_STATUS.PRICED) {
    return null;
  }

  return marketplace.estimatedValue;
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

function getCompletionPhase(pending: number) {
  return pending > 0
    ? RADAR_UPDATE_RUN_PHASE.COMPLETED_WITH_ISSUES
    : RADAR_UPDATE_RUN_PHASE.COMPLETED;
}

function getCompletionMessage(
  locale: string | undefined,
  pending: number,
  processed: number,
): string {
  if (pending > 0) {
    return radarT(locale, 'backend.radar.updateCompletedWithIssues', { processed, pending });
  }

  return radarT(locale, 'backend.radar.updateCompleted', { processed });
}

async function runClaimedRadarUpdateRun({
  db,
  userId,
  locale,
  discogs,
}: RadarUpdateRunInput): Promise<void> {
  let wantlist = createEmptyWantlistResult();

  try {
    setUpdateRunState(userId, locale, {
      phase: RADAR_UPDATE_RUN_PHASE.SYNCING,
      current: 0,
      total: 0,
      pending: 0,
      message: radarT(locale, 'backend.radar.updateSyncing'),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      wantlist,
    });

    const wantlistRows = await discogs.getAllWantlist();
    wantlist = syncRadarWantlist(db, userId, wantlistRows);

    const pendingRows = getPendingRadarEnrichmentRows(db, userId);
    const totalPending = pendingRows.length;

    if (!totalPending) {
      setUpdateRunState(userId, locale, {
        phase: RADAR_UPDATE_RUN_PHASE.COMPLETED,
        current: 0,
        total: 0,
        pending: 0,
        message: radarT(locale, 'backend.radar.updateCompletedNoPending'),
        wantlist,
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    let processed = 0;

    setUpdateRunState(userId, locale, {
      phase: RADAR_UPDATE_RUN_PHASE.REVIEWING_PRICES,
      current: 0,
      total: totalPending,
      pending: totalPending,
      message: getReviewingMessage(locale, 0, totalPending),
      wantlist,
    });

    for (let offset = 0; offset < pendingRows.length && isRadarUpdateRunRunning(userId); offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);

      for (const row of rows) {
        if (!isRadarUpdateRunRunning(userId)) {
          break;
        }

        const marketplace = await fetchMarketplaceValue(discogs, row.release_id, DEFAULT_CURRENCY);
        updateRadarMarketplaceValue(db, userId, row, marketplace);

        processed += 1;
        setUpdateRunState(userId, locale, {
          phase: RADAR_UPDATE_RUN_PHASE.REVIEWING_PRICES,
          current: processed,
          total: totalPending,
          pending: getPendingRadarEnrichmentCount(db, userId),
          message: getReviewingMessage(locale, processed, totalPending),
          wantlist,
        });
      }
    }

    const finalPending = getPendingRadarEnrichmentCount(db, userId);
    const wasStopped = !isRadarUpdateRunRunning(userId) && finalPending > 0;

    setUpdateRunState(userId, locale, {
      phase: wasStopped ? RADAR_UPDATE_RUN_PHASE.STOPPED : getCompletionPhase(finalPending),
      current: processed,
      total: totalPending,
      pending: finalPending,
      message: wasStopped
        ? radarT(locale, 'backend.radar.updateStopped', { processed, pending: finalPending })
        : getCompletionMessage(locale, finalPending, processed),
      wantlist,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    setUpdateRunState(userId, locale, {
      phase: RADAR_UPDATE_RUN_PHASE.FAILED,
      message: getErrorMessage(error),
      wantlist,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearRadarUpdateRunRunning(userId);
  }
}

export function startRadarUpdateRun(input: RadarUpdateRunInput): boolean {
  if (!markRadarUpdateRunRunning(input.userId)) {
    return false;
  }

  runClaimedRadarUpdateRun(input).catch((error) => {
    input.onBackgroundError?.(error);
  });

  return true;
}

export function stopRadarUpdateRun(
  db: Database.Database,
  userId: number,
  locale: string | undefined,
): void {
  const pending = getPendingRadarEnrichmentCount(db, userId);
  const currentState = getStoredOrIdleState(userId, locale);

  clearRadarUpdateRunRunning(userId);
  setUpdateRunState(userId, locale, {
    phase: RADAR_UPDATE_RUN_PHASE.STOPPED,
    pending,
    message: radarT(locale, 'backend.radar.updateStopped', {
      processed: currentState.current,
      pending,
    }),
    finishedAt: new Date().toISOString(),
  });
}

export function getRadarUpdateRunStatus(
  db: Database.Database,
  userId: number,
  locale: string | undefined,
): RadarUpdateRunStatus {
  const state = getStoredOrIdleState(userId, locale);
  const pending = getPendingRadarEnrichmentCount(db, userId);

  return normalizeRadarUpdateRunStatus({
    ...state,
    pending,
    message: state.message || radarT(locale, 'backend.radar.ready'),
  });
}
