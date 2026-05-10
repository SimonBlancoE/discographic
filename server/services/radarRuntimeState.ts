import type {
  RadarEnrichmentStatus,
  RadarWantlistPreviewResponse,
} from '../../shared/contracts/radar.js';

export type RadarRuntimeEnrichmentState = Omit<
  RadarEnrichmentStatus,
  'isRunning' | 'isTerminal' | 'progressPercent'
>;

export type StoredRadarWantlistPreview<Preview = RadarWantlistPreviewResponse> = {
  userId: number;
  displayCurrency: string;
  preview: Preview;
  expiresAt: number;
};

const runningRadarEnrichments = new Set<number>();
const radarEnrichmentStates = new Map<number, RadarRuntimeEnrichmentState>();
const radarWantlistPreviewCache = new Map<string, StoredRadarWantlistPreview<RadarWantlistPreviewResponse>>();

export function isRadarEnrichmentRunning(userId: number): boolean {
  return runningRadarEnrichments.has(userId);
}

export function markRadarEnrichmentRunning(userId: number): boolean {
  if (runningRadarEnrichments.has(userId)) {
    return false;
  }

  runningRadarEnrichments.add(userId);
  return true;
}

export function clearRadarEnrichmentRunning(userId: number): void {
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
  radarEnrichmentStates.delete(userId);

  for (const [previewId, cached] of radarWantlistPreviewCache) {
    if (cached.userId === userId) {
      radarWantlistPreviewCache.delete(previewId);
    }
  }
}
