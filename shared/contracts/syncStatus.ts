export const SYNC_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STALLED: 'stalled'
} as const);
export type WorkflowStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export const IMPORT_SYNC_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
  LOCAL_ONLY: 'local_only'
} as const);
export type ImportWorkflowStatus = (typeof IMPORT_SYNC_STATUS)[keyof typeof IMPORT_SYNC_STATUS];

type UnknownRecord = Record<string, unknown>;
export type ProgressWorkflow = {
  status: WorkflowStatus;
  current: number;
  total: number;
  progressPercent: number;
  message: string;
};
export type EnrichmentWorkflow = ProgressWorkflow & {
  pending: number;
};
export type ImportFailure = {
  dbId: number | null;
  releaseId: number | null;
  instanceId: number | null;
  artist: string;
  title: string;
  reason: string;
};
export type SyncStatusState = {
  locale: string;
  status: WorkflowStatus;
  phase: string;
  current: number;
  total: number;
  progressPercent: number;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  recordsSynced: number;
  isRunning: boolean;
  isTerminal: boolean;
  enrichment: EnrichmentWorkflow;
  thumbnails: ProgressWorkflow;
  inventory: ProgressWorkflow;
};
export type ImportSyncState = {
  locale: string;
  status: ImportWorkflowStatus;
  current: number;
  total: number;
  applied: number;
  synced: number;
  failed: number;
  failures: ImportFailure[];
  progressPercent: number;
  isTerminal: boolean;
  message: string;
};

const SYNC_STATUSES = new Set<WorkflowStatus>(Object.values(SYNC_STATUS));
const TERMINAL_SYNC_STATUSES = new Set<WorkflowStatus>([SYNC_STATUS.COMPLETED, SYNC_STATUS.FAILED]);
const IMPORT_STATUSES = new Set<ImportWorkflowStatus>(Object.values(IMPORT_SYNC_STATUS));
const IMPORT_TERMINAL_STATUSES = new Set([
  IMPORT_SYNC_STATUS.COMPLETED,
  IMPORT_SYNC_STATUS.PARTIAL,
  IMPORT_SYNC_STATUS.FAILED,
  IMPORT_SYNC_STATUS.LOCAL_ONLY
]) as ReadonlySet<ImportWorkflowStatus>;

const IMPORT_RESULT_META = {
  [IMPORT_SYNC_STATUS.COMPLETED]: {
    tone: 'success',
    titleKey: 'collection.importCompletedTitle',
    helpKey: null
  },
  [IMPORT_SYNC_STATUS.PARTIAL]: {
    tone: 'warning',
    titleKey: 'collection.importPartialTitle',
    helpKey: 'collection.importPartialHelp'
  },
  [IMPORT_SYNC_STATUS.LOCAL_ONLY]: {
    tone: 'warning',
    titleKey: 'collection.importLocalOnlyTitle',
    helpKey: 'collection.importLocalOnlyHelp'
  },
  [IMPORT_SYNC_STATUS.FAILED]: {
    tone: 'error',
    titleKey: 'collection.importFailedTitle',
    helpKey: 'collection.importFailedHelp'
  }
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number;
function asNumber(value: unknown, fallback: number): number;
function asNumber(value: unknown, fallback: null): number | null;
function asNumber(value: unknown, fallback: number | null = 0): number | null {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function progressPercent(current: number, total: number): number {
  if (!total) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

function normalizeWorkflowStatus(value: unknown, fallback: WorkflowStatus = SYNC_STATUS.IDLE): WorkflowStatus {
  return SYNC_STATUSES.has(value as WorkflowStatus) ? (value as WorkflowStatus) : fallback;
}

function normalizeImportStatus(value: unknown): ImportWorkflowStatus {
  return IMPORT_STATUSES.has(value as ImportWorkflowStatus) ? (value as ImportWorkflowStatus) : IMPORT_SYNC_STATUS.IDLE;
}

function normalizeProgressWorkflow(workflow: unknown = {}): ProgressWorkflow {
  const source = asRecord(workflow);
  const current = asNumber(source?.current);
  const total = asNumber(source?.total);
  return {
    status: normalizeWorkflowStatus(source?.status),
    current,
    total,
    progressPercent: progressPercent(current, total),
    message: asText(source?.message)
  };
}

function normalizeEnrichmentWorkflow(workflow: unknown = {}): EnrichmentWorkflow {
  const source = asRecord(workflow);
  const normalized = normalizeProgressWorkflow(workflow);
  return {
    ...normalized,
    pending: asNumber(source?.pending)
  };
}

function normalizeImportFailure(failure: unknown): ImportFailure | null {
  if (!failure || typeof failure !== 'object') {
    return null;
  }

  const source = asRecord(failure);
  return {
    dbId: asNumber(source?.dbId, null),
    releaseId: asNumber(source?.releaseId, null),
    instanceId: asNumber(source?.instanceId, null),
    artist: asText(source?.artist),
    title: asText(source?.title),
    reason: asText(source?.reason)
  };
}

export function normalizeSyncStatus(payload: UnknownRecord = {}): SyncStatusState {
  const status = normalizeWorkflowStatus(payload?.status);
  const current = asNumber(payload?.current);
  const total = asNumber(payload?.total);

  return {
    locale: asText(payload?.locale, 'es') || 'es',
    status,
    phase: asText(payload?.phase, status === SYNC_STATUS.FAILED ? 'error' : SYNC_STATUS.IDLE),
    current,
    total,
    progressPercent: progressPercent(current, total),
    message: asText(payload?.message),
    startedAt: asNullableText(payload?.startedAt),
    finishedAt: asNullableText(payload?.finishedAt),
    recordsSynced: asNumber(payload?.recordsSynced),
    isRunning: status === SYNC_STATUS.RUNNING,
    isTerminal: TERMINAL_SYNC_STATUSES.has(status),
    enrichment: normalizeEnrichmentWorkflow(payload?.enrichment),
    thumbnails: normalizeProgressWorkflow(payload?.thumbnails),
    inventory: normalizeProgressWorkflow(payload?.inventory)
  };
}

export function normalizeImportSyncState(payload: UnknownRecord = {}): ImportSyncState {
  const status = normalizeImportStatus(payload?.status);
  const current = asNumber(payload?.current);
  const total = asNumber(payload?.total);
  const failures = asArray(payload?.failures)
    .map(normalizeImportFailure)
    .filter((failure): failure is ImportFailure => Boolean(failure));

  return {
    locale: asText(payload?.locale, 'es') || 'es',
    status,
    current,
    total,
    applied: asNumber(payload?.applied, total),
    synced: asNumber(payload?.synced),
    failed: asNumber(payload?.failed, failures.length),
    failures,
    progressPercent: progressPercent(current, total),
    isTerminal: isTerminalImportStatus(status),
    message: asText(payload?.message)
  };
}

export function isTerminalImportStatus(status: unknown): boolean {
  return IMPORT_TERMINAL_STATUSES.has(status as ImportWorkflowStatus);
}

export function getImportResultTone(status: unknown): string {
  return IMPORT_RESULT_META[status as keyof typeof IMPORT_RESULT_META]?.tone || 'neutral';
}

export function getImportResultTitleKey(status: unknown): string {
  return IMPORT_RESULT_META[status as keyof typeof IMPORT_RESULT_META]?.titleKey || 'collection.done';
}

export function getImportResultHelpKey(status: unknown): string | null {
  return IMPORT_RESULT_META[status as keyof typeof IMPORT_RESULT_META]?.helpKey || null;
}
