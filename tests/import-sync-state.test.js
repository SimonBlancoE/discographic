import { describe, expect, it } from 'vitest';
import { translate } from '../shared/i18n.js';
import {
  buildImportFailure,
  createIdleImportSyncState,
  createLocalOnlyImportSyncState,
  createRunningImportSyncState,
  summarizeImportSyncResult,
  summarizeInterruptedImportSync
} from '../server/services/importSync.js';
import {
  getImportResultHelpKey,
  getImportResultTitleKey,
  getImportResultTone,
  isTerminalImportStatus
} from '../src/lib/importSync.js';

const t = (key, vars) => translate('en', key, vars);

describe('import sync state helpers', () => {
  it('creates an idle state with zero progress', () => {
    expect(createIdleImportSyncState({ locale: 'en', t })).toEqual({
      locale: 'en',
      status: 'idle',
      current: 0,
      total: 0,
      applied: 0,
      synced: 0,
      failed: 0,
      failures: [],
      message: 'No active import'
    });
  });

  it('tracks running progress with synced and failed counts', () => {
    const failures = [buildImportFailure({ dbId: 1, releaseId: 10, instanceId: 20, artist: 'Artist', title: 'Title' }, 'Rating: boom')];
    const state = createRunningImportSyncState({
      locale: 'en',
      current: 2,
      total: 4,
      synced: 1,
      failures,
      t
    });

    expect(state.status).toBe('running');
    expect(state.current).toBe(2);
    expect(state.synced).toBe(1);
    expect(state.failed).toBe(1);
    expect(state.message).toBe('Syncing 2/4 with Discogs...');
  });

  it('summarizes successful, partial, failed, and local-only outcomes', () => {
    const failure = buildImportFailure({ dbId: 2, releaseId: 11, instanceId: 21, artist: 'Artist', title: 'Broken' }, 'Notes: timeout');

    expect(summarizeImportSyncResult({
      locale: 'en',
      total: 3,
      synced: 3,
      failures: [],
      t
    }).status).toBe('completed');

    const partial = summarizeImportSyncResult({
      locale: 'en',
      total: 3,
      synced: 2,
      failures: [failure],
      t
    });
    expect(partial.status).toBe('partial');
    expect(partial.failed).toBe(1);
    expect(partial.message).toBe('2 changes were synced with Discogs, but 1 failed.');

    const failed = summarizeImportSyncResult({
      locale: 'en',
      total: 3,
      synced: 0,
      failures: [failure, failure, failure],
      t
    });
    expect(failed.status).toBe('failed');
    expect(failed.message).toBe('Discogs could not apply any of the 3 changes.');

    const localOnly = createLocalOnlyImportSyncState({
      locale: 'en',
      total: 3,
      t
    });
    expect(localOnly.status).toBe('local_only');
    expect(localOnly.message).toBe('3 changes were saved locally. Discogs could not be reached to sync them.');
  });

  it('summarizes interrupted syncs with truthful processed counts', () => {
    const failure = buildImportFailure({ dbId: 3, releaseId: 12, instanceId: 22, artist: 'Artist', title: 'Interrupted' }, 'Rating: bad gateway');
    const state = summarizeInterruptedImportSync({
      locale: 'en',
      total: 5,
      processed: 3,
      synced: 1,
      failures: [failure],
      error: new Error('socket hang up'),
      t
    });

    expect(state.status).toBe('partial');
    expect(state.current).toBe(3);
    expect(state.failed).toBe(1);
    expect(state.message).toContain('3/5');
    expect(state.message).toContain('1 synced');
    expect(state.message).toContain('2 were left pending');
  });
});

describe('client import result helpers', () => {
  it('classifies terminal statuses and UI tone correctly', () => {
    expect(isTerminalImportStatus('completed')).toBe(true);
    expect(isTerminalImportStatus('partial')).toBe(true);
    expect(isTerminalImportStatus('local_only')).toBe(true);
    expect(isTerminalImportStatus('failed')).toBe(true);
    expect(isTerminalImportStatus('running')).toBe(false);

    expect(getImportResultTone('completed')).toBe('success');
    expect(getImportResultTone('partial')).toBe('warning');
    expect(getImportResultTone('local_only')).toBe('warning');
    expect(getImportResultTone('failed')).toBe('error');
  });

  it('maps terminal statuses to the correct title and help keys', () => {
    expect(getImportResultTitleKey('completed')).toBe('collection.importCompletedTitle');
    expect(getImportResultTitleKey('partial')).toBe('collection.importPartialTitle');
    expect(getImportResultTitleKey('local_only')).toBe('collection.importLocalOnlyTitle');
    expect(getImportResultTitleKey('failed')).toBe('collection.importFailedTitle');

    expect(getImportResultHelpKey('completed')).toBeNull();
    expect(getImportResultHelpKey('partial')).toBe('collection.importPartialHelp');
    expect(getImportResultHelpKey('local_only')).toBe('collection.importLocalOnlyHelp');
    expect(getImportResultHelpKey('failed')).toBe('collection.importFailedHelp');
  });
});
