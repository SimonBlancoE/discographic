import { errorMessage } from './errors.js';
import type { ImportFailure, ImportSyncState } from '../../shared/contracts/syncStatus.js';
import type { TranslationVars } from '../../shared/i18n.js';

type Translator = (key: string, vars?: TranslationVars) => string;
type ImportChange = {
  dbId: number | null;
  releaseId: number | null;
  instanceId: number | null;
  artist: string;
  title: string;
};

export function buildImportFailure(change: ImportChange, reason: string): ImportFailure {
  return {
    dbId: change.dbId,
    releaseId: change.releaseId,
    instanceId: change.instanceId,
    artist: change.artist,
    title: change.title,
    reason
  };
}

export type ImportSyncProgress = Omit<ImportSyncState, 'pending' | 'pendingFailed' | 'progressPercent' | 'isTerminal'>;
function buildState({ locale, status, current, total, synced = 0, failures = [], message }: Omit<ImportSyncProgress, 'applied' | 'failed' | 'synced' | 'failures'> & { synced?: number; failures?: ImportFailure[] }): ImportSyncProgress {
  return {
    locale,
    status,
    current,
    total,
    applied: total,
    synced,
    failed: failures.length,
    failures,
    message
  };
}

export function createIdleImportSyncState({ locale, t }: { locale: string; t: Translator }) {
  return buildState({
    locale,
    status: 'idle',
    current: 0,
    total: 0,
    synced: 0,
    failures: [],
    message: t('backend.import.idle')
  });
}

export function createRunningImportSyncState({ locale, current = 0, total, synced = 0, failures = [], t }: {
  locale: string;
  current?: number;
  total: number;
  synced?: number;
  failures?: ImportFailure[];
  t: Translator;
}) {
  return buildState({
    locale,
    status: 'running',
    current,
    total,
    synced,
    failures,
    message: t('backend.import.syncing', { current, total })
  });
}

export function createLocalOnlyImportSyncState({ locale, total, t }: {
  locale: string;
  total: number;
  t: Translator;
}) {
  return buildState({
    locale,
    status: 'local_only',
    current: total,
    total,
    synced: 0,
    failures: [],
    message: t('backend.import.localOnlyCompleted', { count: total })
  });
}

export function summarizeImportSyncResult({ locale, total, synced, failures = [], t }: {
  locale: string;
  total: number;
  synced: number;
  failures?: ImportFailure[];
  t: Translator;
}) {
  if (!failures.length) {
    return buildState({
      locale,
      status: 'completed',
      current: total,
      total,
      synced,
      failures: [],
      message: t('backend.import.completed', { count: synced })
    });
  }

  if (!synced) {
    return buildState({
      locale,
      status: 'failed',
      current: total,
      total,
      synced: 0,
      failures,
      message: t('backend.import.failedAll', { count: total })
    });
  }

  return buildState({
    locale,
    status: 'partial',
    current: total,
    total,
    synced,
    failures,
    message: t('backend.import.partial', { synced, failed: failures.length })
  });
}

export function summarizeInterruptedImportSync({ locale, total, processed, synced, failures = [], error, t }: {
  locale: string;
  total: number;
  processed: number;
  synced: number;
  failures?: ImportFailure[];
  error: unknown;
  t: Translator;
}) {
  const remaining = Math.max(0, total - processed);
  const status = processed > 0 ? 'partial' : 'failed';

  return buildState({
    locale,
    status,
    current: processed,
    total,
    synced,
    failures,
    message: t('backend.import.interrupted', {
      processed,
      total,
      synced,
      failed: failures.length,
      remaining,
      error: errorMessage(error) || t('backend.import.unknownSyncError')
    })
  });
}
