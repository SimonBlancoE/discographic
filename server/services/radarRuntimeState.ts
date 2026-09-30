import { createUserJobScope, type UserJobScope } from './userJobs.js';
import type {
  RadarUpdateRunStatus,
  RadarWantlistPreviewResponse,
} from '../../shared/contracts/radar.js';

export type RadarRuntimeUpdateRunState = Omit<
  RadarUpdateRunStatus,
  'isRunning' | 'isTerminal' | 'progressPercent' | 'canStop'
>;

export type StoredRadarWantlistPreview<Preview = RadarWantlistPreviewResponse> = {
  userId: number;
  displayCurrency: string;
  preview: Preview;
  expiresAt: number;
};

const runningRadarUpdateRuns = new Map<number, UserJobScope>();
const radarUpdateRunStates = new Map<number, RadarRuntimeUpdateRunState>();
const radarWantlistPreviewCache = new Map<string, StoredRadarWantlistPreview<RadarWantlistPreviewResponse>>();

export function isRadarUpdateRunRunning(userId: number): boolean {
  return runningRadarUpdateRuns.has(userId);
}

export function markRadarUpdateRunRunning(userId: number): UserJobScope | null {
  if (runningRadarUpdateRuns.has(userId)) return null;
  const run = createUserJobScope(userId);
  runningRadarUpdateRuns.set(userId, run);
  return run;
}

export function clearRadarUpdateRunRunning(userId: number, owner?: UserJobScope): void {
  const run = runningRadarUpdateRuns.get(userId);
  if (owner && run !== owner) return;
  run?.cancel();
  runningRadarUpdateRuns.delete(userId);
}

export function getRadarUpdateRunState(userId: number): RadarRuntimeUpdateRunState | null {
  return radarUpdateRunStates.get(userId) ?? null;
}

export function setRadarUpdateRunState(
  userId: number,
  state: RadarRuntimeUpdateRunState,
): RadarRuntimeUpdateRunState {
  radarUpdateRunStates.set(userId, state);
  return state;
}

export function storeRadarWantlistPreview(
  previewId: string,
  preview: StoredRadarWantlistPreview<RadarWantlistPreviewResponse>,
): void {
  radarWantlistPreviewCache.set(previewId, preview);
}

export function getStoredRadarWantlistPreview(
  previewId: string,
): StoredRadarWantlistPreview<RadarWantlistPreviewResponse> | null {
  return radarWantlistPreviewCache.get(previewId) ?? null;
}

export function deleteStoredRadarWantlistPreview(previewId: string): void {
  radarWantlistPreviewCache.delete(previewId);
}

export function cleanupExpiredRadarWantlistPreviews(now = Date.now()): void {
  for (const [previewId, cached] of radarWantlistPreviewCache) {
    if (cached.expiresAt < now) {
      radarWantlistPreviewCache.delete(previewId);
    }
  }
}

export function resetRadarRuntimeState(userId: number): void {
  clearRadarUpdateRunRunning(userId);
  radarUpdateRunStates.delete(userId);

  for (const [previewId, cached] of radarWantlistPreviewCache) {
    if (cached.userId === userId) {
      radarWantlistPreviewCache.delete(previewId);
    }
  }
}
