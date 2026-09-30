import { createUserJobScope, type UserJobScope } from './userJobs.js';
import type {
  RadarEnrichmentStatus,
  RadarUpdateRunStatus,
  RadarWantlistPreviewResponse,
} from '../../shared/contracts/radar.js';

export type RadarRuntimeEnrichmentState = Omit<
  RadarEnrichmentStatus,
  'isRunning' | 'isTerminal' | 'progressPercent'
>;
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

const runningRadarEnrichments = new Map<number, UserJobScope>();
const radarEnrichmentStates = new Map<number, RadarRuntimeEnrichmentState>();
const runningRadarUpdateRuns = new Map<number, UserJobScope>();
const radarUpdateRunStates = new Map<number, RadarRuntimeUpdateRunState>();
const radarWantlistPreviewCache = new Map<string, StoredRadarWantlistPreview<RadarWantlistPreviewResponse>>();

export function isRadarEnrichmentRunning(userId: number): boolean {
  return runningRadarEnrichments.has(userId);
}

export function markRadarEnrichmentRunning(userId: number): UserJobScope | null {
  if (runningRadarEnrichments.has(userId)) return null;
  const run = createUserJobScope(userId);
  runningRadarEnrichments.set(userId, run);
  return run;
}

export function clearRadarEnrichmentRunning(userId: number, owner?: UserJobScope): void {
  const run = runningRadarEnrichments.get(userId);
  if (owner && run !== owner) return;
  run?.cancel();
  runningRadarEnrichments.delete(userId);
}

export function getRadarEnrichmentState(userId: number): RadarRuntimeEnrichmentState | null {
  return radarEnrichmentStates.get(userId) ?? null;
}

export function setRadarEnrichmentState(
  userId: number,
  state: RadarRuntimeEnrichmentState,
): RadarRuntimeEnrichmentState {
  radarEnrichmentStates.set(userId, state);
  return state;
}

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
  clearRadarEnrichmentRunning(userId);
  clearRadarUpdateRunRunning(userId);
  radarEnrichmentStates.delete(userId);
  radarUpdateRunStates.delete(userId);

  for (const [previewId, cached] of radarWantlistPreviewCache) {
    if (cached.userId === userId) {
      radarWantlistPreviewCache.delete(previewId);
    }
  }
}
