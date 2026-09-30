import type { DiscogsRequestOptions } from '../discogs.js';
import type { UserJobScope } from './userJobs.js';
import type Database from 'better-sqlite3';
import {
  RADAR_UPDATE_RUN_PHASE,
  normalizeRadarUpdateRunStatus,
  type RadarSyncResult,
  type RadarUpdateRunStatus,
} from '../../shared/contracts/radar.js';
import { translate } from '../../shared/i18n.js';
import {
  clearRadarUpdateRunRunning,
  getRadarUpdateRunState,
  markRadarUpdateRunRunning,
  setRadarUpdateRunState,
  type RadarRuntimeUpdateRunState,
} from './radarRuntimeState.js';
import { syncRadarWantlist } from './radarWantlist.js';

type DiscogsClient = {
  getAllWantlist: (perPage?: number, options?: DiscogsRequestOptions) => Promise<unknown[]>;
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
    message: radarT(locale, 'backend.radar.updateReady'),
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

function getCompletionMessage(locale: string | undefined, processed: number): string {
  return radarT(locale, 'backend.radar.updateCompleted', { processed });
}

async function runClaimedRadarUpdateRun({
  db,
  userId,
  locale,
  discogs,
}: RadarUpdateRunInput, run: UserJobScope): Promise<void> {
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

    const wantlistRows = await discogs.getAllWantlist(undefined, { signal: run.signal });
    if (run.stopped) return;
    wantlist = syncRadarWantlist(db, userId, wantlistRows);
    const processed = wantlist.totalFetched;

    setUpdateRunState(userId, locale, {
      phase: RADAR_UPDATE_RUN_PHASE.COMPLETED,
      current: processed,
      total: processed,
      pending: 0,
      message: getCompletionMessage(locale, processed),
      wantlist,
      finishedAt: new Date().toISOString(),
    });
  } catch {
    if (run.stopped) return;
    setUpdateRunState(userId, locale, {
      phase: RADAR_UPDATE_RUN_PHASE.FAILED,
      message: radarT(locale, 'backend.radar.updateFailed'),
      wantlist,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearRadarUpdateRunRunning(userId, run);
  }
}

export function startRadarUpdateRun(input: RadarUpdateRunInput): boolean {
  const run = markRadarUpdateRunRunning(input.userId);
  if (!run) {
    return false;
  }

  runClaimedRadarUpdateRun(input, run).catch((error) => {
    input.onBackgroundError?.(error);
  });

  return true;
}

export function stopRadarUpdateRun(
  _db: Database.Database,
  userId: number,
  locale: string | undefined,
): void {
  const currentState = getStoredOrIdleState(userId, locale);

  clearRadarUpdateRunRunning(userId);
  setUpdateRunState(userId, locale, {
    phase: RADAR_UPDATE_RUN_PHASE.STOPPED,
    pending: 0,
    message: radarT(locale, 'backend.radar.updateStopped', {
      processed: currentState.current,
    }),
    finishedAt: new Date().toISOString(),
  });
}

export function getRadarUpdateRunStatus(
  _db: Database.Database,
  userId: number,
  locale: string | undefined,
): RadarUpdateRunStatus {
  const state = getStoredOrIdleState(userId, locale);

  return normalizeRadarUpdateRunStatus({
    ...state,
    pending: 0,
    message: state.message || radarT(locale, 'backend.radar.updateReady'),
  });
}
