export const IMPORT_TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'local_only']);

const IMPORT_RESULT_META = {
  completed: {
    tone: 'success',
    titleKey: 'collection.importCompletedTitle',
    helpKey: null
  },
  partial: {
    tone: 'warning',
    titleKey: 'collection.importPartialTitle',
    helpKey: 'collection.importPartialHelp'
  },
  local_only: {
    tone: 'warning',
    titleKey: 'collection.importLocalOnlyTitle',
    helpKey: 'collection.importLocalOnlyHelp'
  },
  failed: {
    tone: 'error',
    titleKey: 'collection.importFailedTitle',
    helpKey: 'collection.importFailedHelp'
  }
};

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
