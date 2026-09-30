import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDiscogsClient } from '../server/discogs.js';
import { migrateRadarStorage } from '../server/services/radarStorage.js';
import { getRadarUpdateRunStatus, startRadarUpdateRun } from '../server/services/radarUpdateRun.js';
import { resetRadarRuntimeState } from '../server/services/radarRuntimeState.js';
import { syncRadarWantlist } from '../server/services/radarWantlist.js';
import { wantlistEntry, wantlistPage } from './fixtures/discogsWantlist.js';

describe('Radar update run with real Discogs snapshots and SQLite', () => {
  let db: Database.Database;
  const userId = 47;

  beforeEach(() => {
    db = new Database(':memory:');
    migrateRadarStorage(db);
    db.prepare(`
      INSERT INTO radar_releases (
        user_id, release_id, title, artist, source_discogs, source_status,
        local_priority, local_target_price_eur, local_note, local_hidden, local_resolved
      ) VALUES (?, 101, 'Keep title', 'Keep artist', 1, 'active', 'high', 22.5, 'Keep decision', 1, 1)
    `).run(userId);
    db.prepare(`
      INSERT INTO radar_releases (user_id, release_id, title, artist, source_discogs, source_status)
      VALUES (?, 202, 'Other account', 'Other artist', 1, 'active')
    `).run(userId + 1);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    resetRadarRuntimeState(userId);
    vi.unstubAllGlobals();
    db.close();
  });

  const rows = () => db.prepare('SELECT * FROM radar_releases ORDER BY user_id, release_id').all();

  async function run(pages: unknown[]) {
    for (const page of pages) {
      vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    expect(startRadarUpdateRun({
      db,
      userId,
      locale: 'en',
      discogs: createDiscogsClient({ token: 'fixture-token', username: 'collector' }),
    })).toBe(true);
    await vi.waitFor(() => expect(getRadarUpdateRunStatus(db, userId, 'en').isTerminal).toBe(true));
    return getRadarUpdateRunStatus(db, userId, 'en');
  }

  it.each([
    ['HTTP 200 empty object', [{}]],
    ['null response', [null]],
    ['missing wants', [{ pagination: wantlistPage([]).pagination }]],
    ['invalid identity', [wantlistPage([-1])]],
    ['duplicate identity', [wantlistPage([101, 101])]],
    ['partial first page', [wantlistPage([303], 1, 100, 2)]],
    ['missing second page', [wantlistPage(Array.from({ length: 100 }, (_, i) => i + 300), 1, 100, 101), null]],
    ['moving total', [wantlistPage(Array.from({ length: 100 }, (_, i) => i + 300), 1, 100, 101), wantlistPage([500], 2, 100, 102)]],
    ['cross-page duplicate', [wantlistPage(Array.from({ length: 100 }, (_, i) => i + 300), 1, 100, 101), wantlistPage([300], 2, 100, 101)]],
  ])('preserves every stored row and decision for %s and reports failure', async (_name, pages) => {
    const before = rows();
    const status = await run(pages);
    expect(status.phase).toBe('failed');
    expect(status.wantlist.totalFetched).toBe(0);
    expect(rows()).toEqual(before);
  });

  it.each([0, 1])('reconciles a genuine empty Wantlist with %i pages for only the current user', async (pages) => {
    const otherAccountBefore = rows()[1];
    const status = await run([wantlistPage([], 1, 100, 0, pages)]);
    expect(status.phase).toBe('completed');
    expect(status.wantlist.markedMissing).toBe(1);
    expect(rows()[0]).toMatchObject({
      source_status: 'missing', local_priority: 'high', local_target_price_eur: 22.5,
      local_note: 'Keep decision', local_hidden: 1, local_resolved: 1,
    });
    expect(rows()[1]).toEqual(otherAccountBefore);
  });

  it('reconciles a complete two-page Wantlist while preserving local decisions and account scoping', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 300);
    const otherAccountBefore = rows()[1];
    const status = await run([wantlistPage(ids, 1, 100, 101), wantlistPage([101], 2, 100, 101)]);
    expect(status.phase).toBe('completed');
    expect(status.wantlist).toMatchObject({ totalFetched: 101, added: 100, updated: 1, markedMissing: 0, ignored: 0 });
    expect(db.prepare('SELECT * FROM radar_releases WHERE user_id = ? AND release_id = 101').get(userId)).toMatchObject({
      title: 'Wanted 101', source_status: 'active', local_note: 'Keep decision', local_target_price_eur: 22.5,
    });
    expect(db.prepare('SELECT * FROM radar_releases WHERE user_id = ?').get(userId + 1)).toEqual(otherAccountBefore);
  });

  it.each([
    ['invalid identity', [wantlistEntry(303), wantlistEntry(-1)]],
    ['missing identity', [wantlistEntry(303), {}]],
    ['duplicate identity', [wantlistEntry(303), wantlistEntry(303)]],
  ])('rejects %s before any reconciliation write', (_name, snapshot) => {
    const before = rows();
    expect(() => syncRadarWantlist(db, userId, snapshot)).toThrow(/wantlist/i);
    expect(rows()).toEqual(before);
  });
});
