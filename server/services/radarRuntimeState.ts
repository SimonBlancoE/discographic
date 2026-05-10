type StoredRadarWantlistPreview<Preview> = {
  userId: number;
  displayCurrency: string;
  preview: Preview;
  expiresAt: number;
};

const runningRadarEnrichments = new Set<number>();
const radarEnrichmentStates = new Map<number, unknown>();
const radarWantlistPreviewCache = new Map<string, StoredRadarWantlistPreview<unknown>>();

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

export function getRadarEnrichmentState<State>(userId: number): State | null {
  return (radarEnrichmentStates.get(userId) as State | undefined) ?? null;
}

export function setRadarEnrichmentState<State>(userId: number, state: State): State {
  radarEnrichmentStates.set(userId, state);
  return state;
}

export function storeRadarWantlistPreview<Preview>(
  previewId: string,
  preview: StoredRadarWantlistPreview<Preview>,
): void {
  radarWantlistPreviewCache.set(previewId, preview);
}

export function getStoredRadarWantlistPreview<Preview>(
  previewId: string,
): StoredRadarWantlistPreview<Preview> | null {
  return (radarWantlistPreviewCache.get(previewId) as StoredRadarWantlistPreview<Preview> | undefined) ?? null;
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
