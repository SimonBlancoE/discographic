import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';
import type { SyncStatusState } from '../shared/contracts/syncStatus.js';

// Keep the real Discogs client and orchestration; only upstream HTTP and its quota are controlled.
vi.mock('../server/middleware/rateLimit.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/middleware/rateLimit.js')>(),
  createDiscogsRateLimiter: () => async () => undefined,
}));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-collection-snapshot-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser, clearUserCollectionData, upsertDiscogsAccount } = await import('../server/db.js');
const { default: router } = await import('../server/routes/sync.js');
let server: Server;
let baseUrl: string;
let userId: number;
let otherUserId: number;
let collectionPages: unknown[];
let collectionResponse: ((page: number) => Promise<unknown>) | undefined;

const release = (instanceId: number, releaseId = 101) => ({
  instance_id: instanceId, rating: 1, notes: [{ field_id: 1, value: 'Remote note' }],
  date_added: '2026-01-01', folder_id: 0,
  basic_information: { id: releaseId, title: 'Remote title', artists: [{ name: 'Remote artist' }] },
});
const collection = (releases: unknown[], page = 1, items = releases.length, pages = Math.ceil(items / 100)) => ({
  pagination: { page, per_page: 100, pages, items }, releases,
});
const fullPage = Array.from({ length: 100 }, (_, i) => release(1000 + i));
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const rows = (accountId?: number) => accountId === undefined
  ? db.prepare('SELECT * FROM releases ORDER BY user_id, instance_id').all()
  : db.prepare('SELECT * FROM releases WHERE user_id = ? ORDER BY instance_id').all(accountId);
async function state(): Promise<SyncStatusState> { return (await fetch(`${baseUrl}/status`)).json(); }
async function start() { expect((await fetch(baseUrl, { method: 'POST' })).status).toBe(200); }
async function terminal() {
  await vi.waitFor(async () => expect((await state()).isTerminal).toBe(true), { timeout: 2000, interval: 5 });
  return state();
}
function log() {
  return db.prepare('SELECT status, records_synced, finished_at FROM sync_log WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
}
beforeAll(async () => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === baseUrl) return realFetch(input, init);
    if (url.origin !== 'https://api.discogs.com' || (init?.method && init.method !== 'GET')) {
      throw new Error('Unexpected external request in collection snapshot test');
    }
    if (url.pathname.endsWith('/collection/folders/0/releases')) {
      const page = Number(url.searchParams.get('page'));
      if (url.searchParams.get('per_page') !== '100') throw new Error('Unexpected collection page size');
      return json(collectionResponse ? await collectionResponse(page) : collectionPages[page - 1]);
    }
    if (url.pathname.endsWith('/collection/fields')) return json({ fields: [] });
    if (url.pathname.endsWith('/collection/folders')) return json({ folders: [] });
    if (url.pathname.endsWith('/collection/value')) return json({});
    if (url.pathname.endsWith('/inventory')) return json({
      pagination: { page: 1, per_page: 100, pages: 0, items: 0 }, listings: [],
    });
    throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
  });
  const app = express();
  app.use(session({ secret: 'temporary-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.userId = userId; req.session.authEpoch = 0; req.locale = 'en';
    req.t = (key, vars) => translate('en', key, vars as TranslationVars); next();
  });
  app.use(router);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
    baseUrl = `http://127.0.0.1:${address.port}`; resolve();
  }); });
});
beforeEach(() => {
  if (userId) deleteUser(userId);
  if (otherUserId) deleteUser(otherUserId);
  userId = createUser(`collection-${Date.now()}`, 'unused').id;
  otherUserId = createUser(`other-${Date.now()}`, 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  const insert = db.prepare(`INSERT INTO releases (user_id,release_id,instance_id,title,artist,rating,notes,
    folder_id,last_seen_sync_id,listing_status,listing_price,listing_currency,listing_price_eur)
    VALUES (?,?,?,'Local title','Local artist',5,'[{"field_id":1,"value":"Pending local edit"}]',7,123,'For Sale',20,'EUR',20)`);
  insert.run(userId, 101, 1000); insert.run(userId, 102, 9999); insert.run(otherUserId, 101, 1000);
  collectionPages = [collection([])]; collectionResponse = undefined;
});
afterAll(async () => {
  deleteUser(userId); deleteUser(otherUserId);
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

describe('production collection snapshot reconciliation', () => {
  it.each([
    ['empty pagination', [{ pagination: {}, releases: [] }]],
    ['HTTP 200 empty object', [{}]],
    ['null envelope', [null]],
    ['missing pagination', [{ releases: [] }]],
    ['missing releases', [{ pagination: collection([]).pagination }]],
    ['invalid releases', [{ ...collection([]), releases: {} }]],
    ['missing page', [{ ...collection([]), pagination: { per_page: 100, pages: 0, items: 0 } }]],
    ['missing page size', [{ ...collection([]), pagination: { page: 1, pages: 0, items: 0 } }]],
    ['missing items', [{ ...collection([]), pagination: { page: 1, per_page: 100, pages: 0 } }]],
    ['missing pages', [{ ...collection([]), pagination: { page: 1, per_page: 100, items: 0 } }]],
    ['wrong page number', [collection([release(1000)], 2)]],
    ['wrong page size', [{ ...collection([]), pagination: { page: 1, per_page: 50, pages: 0, items: 0 } }]],
    ['string total', [{ ...collection([]), pagination: { page: 1, per_page: 100, pages: 0, items: '0' } }]],
    ['short first page', [collection([release(1000)], 1, 2)]],
    ['inflated page count', [collection([release(1000)], 1, 1, 2)]],
    ['zero pages with releases', [collection([release(1000)], 1, 1, 0)]],
    ['duplicate instance', [collection([release(1000), release(1000, 102)])]],
    ['missing instance identity', [collection([{ basic_information: { id: 101 } }])]],
    ['zero instance identity', [collection([release(0)])]],
    ['string instance identity', [collection([{ ...release(1000), instance_id: '1000' }])]],
    ['unsafe instance identity', [collection([release(Number.MAX_SAFE_INTEGER + 1)])]],
    ['missing release identity', [collection([{ instance_id: 1000, basic_information: {} }])]],
    ['negative release identity', [collection([release(1000, -1)])]],
    ['fractional release identity', [collection([release(1000, 101.5)])]],
    ['missing second page', [collection(fullPage, 1, 101), null]],
    ['truncated second page', [collection(fullPage, 1, 102), collection([release(2000)], 2, 102)]],
    ['cross-page duplicate instance', [collection(fullPage, 1, 101), collection([release(1000, 102)], 2, 101)]],
    ['changing totals', [collection(fullPage, 1, 101), collection([release(2000), release(2001)], 2, 102)]],
    ['wrong second-page identity', [collection(fullPage, 1, 101), collection([release(2000, 0)], 2, 101)]],
    ['wrong second-page number', [collection(fullPage, 1, 101), collection([release(2000)], 1, 101)]],
  ])('preserves every prior row and pending local edit and fails the run for %s', async (_name, pages) => {
    collectionPages = pages;
    const before = rows();
    await start(); const status = await terminal();
    expect(rows()).toEqual(before);
    expect(status).toMatchObject({ status: 'failed', recordsSynced: 0 });
    expect(log()).toMatchObject({ status: 'failed', records_synced: 0, finished_at: expect.any(String) });
  });

  it.each([0, 1])('reconciles an explicit empty snapshot with %i pages only for the syncing account', async pages => {
    collectionPages = [collection([], 1, 0, pages)];
    const otherBefore = rows(otherUserId);
    await start(); expect(await terminal()).toMatchObject({ status: 'completed', recordsSynced: 0 });
    expect(rows(userId)).toEqual([]); expect(rows(otherUserId)).toEqual(otherBefore);
    expect(log()).toMatchObject({ status: 'completed', records_synced: 0, finished_at: expect.any(String) });
  });

  it('accepts distinct collection copies of one release and prunes only missing instances for this account', async () => {
    collectionPages = [collection([release(1000), release(2000)])];
    const otherBefore = rows(otherUserId);
    await start(); expect(await terminal()).toMatchObject({ status: 'completed', recordsSynced: 2 });
    expect(rows(userId)).toEqual([
      expect.objectContaining({ instance_id: 1000, release_id: 101, title: 'Remote title', rating: 1 }),
      expect.objectContaining({ instance_id: 2000, release_id: 101, title: 'Remote title', rating: 1 }),
    ]);
    expect(rows(otherUserId)).toEqual(otherBefore);
    expect(log()).toMatchObject({ status: 'completed', records_synced: 2 });
  });

  it.each(['complete', 'truncated'] as const)('buffers all rows while page two is pending and handles its %s result', async outcome => {
    let resolve!: (value: unknown) => void;
    let secondPageEntered = false;
    const held = new Promise<unknown>(done => { resolve = done; });
    collectionResponse = async page => {
      if (page === 1) return collection(fullPage, 1, 101);
      secondPageEntered = true; return held;
    };
    const before = rows();
    await start(); await vi.waitFor(() => expect(secondPageEntered).toBe(true));
    const during = rows(); const duringState = await state(); const duringLog = log();
    resolve(collection(outcome === 'complete' ? [release(2000)] : [], 2, 101));
    const result = await terminal();
    expect(during).toEqual(before);
    expect(duringState).toMatchObject({ status: 'running', phase: 'downloading', current: 100, total: 101, recordsSynced: 0 });
    expect(duringLog).toMatchObject({ status: 'running', records_synced: 0, finished_at: null });
    if (outcome === 'complete') {
      expect(result).toMatchObject({ status: 'completed', recordsSynced: 101 });
      expect(rows(userId)).toHaveLength(101); expect(rows(otherUserId)).toEqual([before[2]]);
    } else {
      expect(result).toMatchObject({ status: 'failed', recordsSynced: 0 });
      expect(rows()).toEqual(before); expect(log()).toMatchObject({ status: 'failed', records_synced: 0 });
    }
  });

  it.each(['resolve', 'reject'] as const)('ignores a cancelled second page that later %ss without changing replacement ownership', async outcome => {
    let resolveOld!: (value: unknown) => void;
    let rejectOld!: (error: Error) => void;
    let resolveReplacement!: (value: unknown) => void;
    let secondPageEntered = false;
    let replacementEntered = false;
    const oldPage = new Promise<unknown>((yes, no) => { resolveOld = yes; rejectOld = no; });
    const replacement = new Promise<unknown>(done => { resolveReplacement = done; });
    collectionResponse = async page => {
      if (page === 1) return collection(fullPage, 1, 101);
      secondPageEntered = true; return oldPage;
    };
    await start(); await vi.waitFor(() => expect(secondPageEntered).toBe(true));
    clearUserCollectionData(userId);
    collectionResponse = async () => { replacementEntered = true; return replacement; };
    await start(); await vi.waitFor(() => expect(replacementEntered).toBe(true));
    outcome === 'resolve' ? resolveOld(collection([release(2000)], 2, 101)) : rejectOld(new Error('Late upstream failure'));
    await oldPage.catch(() => undefined);
    const replacementState = await state();
    expect(replacementState).toMatchObject({ status: 'running', isTerminal: false, current: 0, recordsSynced: 0 });
    expect(log()).toMatchObject({ status: 'running', finished_at: null });
    expect((await fetch(baseUrl, { method: 'POST' })).status).toBe(409);
    expect(rows(userId)).toEqual([]);
    resolveReplacement(collection([]));
    expect(await terminal()).toMatchObject({ status: 'completed', recordsSynced: 0 });
  });
});
