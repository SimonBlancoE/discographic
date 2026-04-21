export const IMPORT_TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'local_only']);

export function isTerminalImportStatus(status) {
  return IMPORT_TERMINAL_STATUSES.has(status);
}

export function getImportResultTone(status) {
  if (status === 'completed') {
    return 'success';
  }

  if (status === 'partial' || status === 'local_only') {
    return 'warning';
  }

  if (status === 'failed') {
    return 'error';
  }

  return 'neutral';
}

export function getImportResultTitleKey(status) {
  if (status === 'completed') {
    return 'collection.importCompletedTitle';
  }

  if (status === 'partial') {
    return 'collection.importPartialTitle';
  }

  if (status === 'local_only') {
    return 'collection.importLocalOnlyTitle';
  }

  if (status === 'failed') {
    return 'collection.importFailedTitle';
  }

  return 'collection.done';
}

export function getImportResultHelpKey(status) {
  if (status === 'partial') {
    return 'collection.importPartialHelp';
  }

  if (status === 'local_only') {
    return 'collection.importLocalOnlyHelp';
  }

  if (status === 'failed') {
    return 'collection.importFailedHelp';
  }

  return null;
}
