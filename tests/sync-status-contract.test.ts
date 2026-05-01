import { describe, expect, it } from 'vitest';
import {
  getImportResultHelpKey,
  getImportResultTitleKey,
  getImportResultTone,
  isTerminalImportStatus,
  normalizeImportSyncState,
  normalizeSyncStatus
} from '../shared/contracts/syncStatus.js';

describe('sync status contract', () => {
  it('normalizes idle sync status with nested workflow defaults', () => {
    expect(normalizeSyncStatus()).toEqual({
      locale: 'es',
      status: 'idle',
      phase: 'idle',
      current: 0,
      total: 0,
      progressPercent: 0,
      message: '',
      startedAt: null,
      finishedAt: null,
      recordsSynced: 0,
      isRunning: false,
      isTerminal: false,
      enrichment: {
        status: 'idle',
        current: 0,
        total: 0,
        pending: 0,
        progressPercent: 0,
        message: ''
      },
      thumbnails: {
        status: 'idle',
        current: 0,
        total: 0,
        progressPercent: 0,
        message: ''
      },
      inventory: {
        status: 'idle',
        current: 0,
        total: 0,
        progressPercent: 0,
        message: ''
      }
    });
  });

  it('normalizes running sync, enrichment, thumbnails, and inventory state', () => {
    const state = normalizeSyncStatus({
      locale: 'en',
      status: 'running',
      phase: 'downloading',
      current: '25',
      total: '100',
      message: 'Downloading collection',
      startedAt: '2026-04-30T10:00:00.000Z',
      recordsSynced: '20',
      enrichment: {
        status: 'running',
        current: '5',
        total: '10',
        pending: '8',
        message: 'Enriching 5/10'
      },
      thumbnails: {
        status: 'completed',
        current: '3',
        total: '3',
        message: 'Covers ready'
      },
      inventory: {
        status: 'failed',
        message: 'Inventory unavailable'
      }
    });

    expect(state.status).toBe('running');
    expect(state.progressPercent).toBe(25);
    expect(state.isRunning).toBe(true);
    expect(state.isTerminal).toBe(false);
    expect(state.enrichment).toMatchObject({ status: 'running', pending: 8, progressPercent: 50 });
    expect(state.thumbnails).toMatchObject({ status: 'completed', progressPercent: 100 });
    expect(state.inventory).toMatchObject({ status: 'failed', message: 'Inventory unavailable' });
  });

  it('keeps completed, failed, and stalled sync statuses distinct', () => {
    expect(normalizeSyncStatus({ status: 'completed', current: 3, total: 3 }).isTerminal).toBe(true);
    expect(normalizeSyncStatus({ status: 'failed', message: 'boom' })).toMatchObject({
      status: 'failed',
      phase: 'error',
      isTerminal: true,
      message: 'boom'
    });
    expect(normalizeSyncStatus({ status: 'stalled', phase: 'downloading' })).toMatchObject({
      status: 'stalled',
      phase: 'downloading',
      isRunning: false,
      isTerminal: false
    });
  });
});

describe('import sync status contract', () => {
  it('normalizes running import progress and failure details', () => {
    const state = normalizeImportSyncState({
      locale: 'en',
      status: 'running',
      current: '2',
      total: '4',
      applied: '4',
      synced: '1',
      failed: '1',
      failures: [
        {
          dbId: '7',
          releaseId: '123',
          instanceId: '456',
          artist: 'Artist',
          title: 'Title',
          reason: 'Rating: timeout'
        },
        null
      ],
      message: 'Syncing 2/4'
    });

    expect(state).toEqual({
      locale: 'en',
      status: 'running',
      current: 2,
      total: 4,
      applied: 4,
      synced: 1,
      failed: 1,
      failures: [
        {
          dbId: 7,
          releaseId: 123,
          instanceId: 456,
          artist: 'Artist',
          title: 'Title',
          reason: 'Rating: timeout'
        }
      ],
      progressPercent: 50,
      isTerminal: false,
      message: 'Syncing 2/4'
    });
  });

  it('classifies terminal import statuses and UI metadata', () => {
    expect(isTerminalImportStatus('completed')).toBe(true);
    expect(isTerminalImportStatus('partial')).toBe(true);
    expect(isTerminalImportStatus('local_only')).toBe(true);
    expect(isTerminalImportStatus('failed')).toBe(true);
    expect(isTerminalImportStatus('running')).toBe(false);

    expect(getImportResultTone('completed')).toBe('success');
    expect(getImportResultTone('partial')).toBe('warning');
    expect(getImportResultTone('local_only')).toBe('warning');
    expect(getImportResultTone('failed')).toBe('error');
    expect(getImportResultTone('idle')).toBe('neutral');

    expect(getImportResultTitleKey('completed')).toBe('collection.importCompletedTitle');
    expect(getImportResultTitleKey('partial')).toBe('collection.importPartialTitle');
    expect(getImportResultTitleKey('local_only')).toBe('collection.importLocalOnlyTitle');
    expect(getImportResultTitleKey('failed')).toBe('collection.importFailedTitle');
    expect(getImportResultTitleKey('idle')).toBe('collection.done');

    expect(getImportResultHelpKey('completed')).toBeNull();
    expect(getImportResultHelpKey('partial')).toBe('collection.importPartialHelp');
    expect(getImportResultHelpKey('local_only')).toBe('collection.importLocalOnlyHelp');
    expect(getImportResultHelpKey('failed')).toBe('collection.importFailedHelp');
  });
});
