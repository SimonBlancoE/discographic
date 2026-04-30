export const SYNC_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STALLED: 'stalled'
});

export const IMPORT_SYNC_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
  LOCAL_ONLY: 'local_only'
});

const SYNC_STATUSES = new Set(Object.values(SYNC_STATUS));
const TERMINAL_SYNC_STATUSES = new Set([SYNC_STATUS.COMPLETED, SYNC_STATUS.FAILED]);
const IMPORT_STATUSES = new Set(Object.values(IMPORT_SYNC_STATUS));
const IMPORT_TERMINAL_STATUSES = new Set([
  IMPORT_SYNC_STATUS.COMPLETED,
  IMPORT_SYNC_STATUS.PARTIAL,
  IMPORT_SYNC_STATUS.FAILED,
  IMPORT_SYNC_STATUS.LOCAL_ONLY
]);

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNullableText(value) {
  return typeof value === 'string' && value ? value : null;
}

function progressPercent(current, total) {
  if (!total) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

function normalizeWorkflowStatus(value, fallback = SYNC_STATUS.IDLE) {
  return SYNC_STATUSES.has(value) ? value : fallback;
}

function normalizeImportStatus(value) {
  return IMPORT_STATUSES.has(value) ? value : IMPORT_SYNC_STATUS.IDLE;
}

function normalizeProgressWorkflow(workflow = {}, { withPending = false } = {}) {
  const current = asNumber(workflow?.current);
  const total = asNumber(workflow?.total);
  const normalized = {
    status: normalizeWorkflowStatus(workflow?.status),
    current,
    total,
    progressPercent: progressPercent(current, total),
    message: asText(workflow?.message)
  };

  if (withPending) {
    normalized.pending = asNumber(workflow?.pending);
  }

  return normalized;
}

function normalizeImportFailure(failure) {
  if (!failure || typeof failure !== 'object') {
    return null;
  }

  return {
    dbId: asNumber(failure.dbId, null),
    releaseId: asNumber(failure.releaseId, null),
    instanceId: asNumber(failure.instanceId, null),
    artist: asText(failure.artist),
    title: asText(failure.title),
    reason: asText(failure.reason)
  };
}

export function normalizeSyncStatus(payload = {}) {
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
    enrichment: normalizeProgressWorkflow(payload?.enrichment, { withPending: true }),
    thumbnails: normalizeProgressWorkflow(payload?.thumbnails),
    inventory: normalizeProgressWorkflow(payload?.inventory)
  };
}

export function normalizeImportSyncState(payload = {}) {
  const status = normalizeImportStatus(payload?.status);
  const current = asNumber(payload?.current);
  const total = asNumber(payload?.total);
  const failures = asArray(payload?.failures)
    .map(normalizeImportFailure)
    .filter(Boolean);

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

export function isTerminalImportStatus(status) {
  return IMPORT_TERMINAL_STATUSES.has(status);
}

export function getImportResultTone(status) {
  return IMPORT_RESULT_META[status]?.tone || 'neutral';
}

export function getImportResultTitleKey(status) {
  return IMPORT_RESULT_META[status]?.titleKey || 'collection.done';
}

export function getImportResultHelpKey(status) {
  return IMPORT_RESULT_META[status]?.helpKey || null;
}
