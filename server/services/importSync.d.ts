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

export function buildImportFailure(change: ImportChange, reason: string): ImportFailure;
export function createIdleImportSyncState(input: { locale: string; t: Translator }): ImportSyncState;
export function createRunningImportSyncState(input: {
  locale: string;
  current?: number;
  total: number;
  synced?: number;
  failures?: ImportFailure[];
  t: Translator;
}): ImportSyncState;
export function createLocalOnlyImportSyncState(input: {
  locale: string;
  total: number;
  t: Translator;
}): ImportSyncState;
export function summarizeImportSyncResult(input: {
  locale: string;
  total: number;
  synced: number;
  failures?: ImportFailure[];
  t: Translator;
}): ImportSyncState;
export function summarizeInterruptedImportSync(input: {
  locale: string;
  total: number;
  processed: number;
  synced: number;
  failures?: ImportFailure[];
  error: Error;
  t: Translator;
}): ImportSyncState;
