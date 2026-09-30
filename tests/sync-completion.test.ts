import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import sharp from 'sharp';
import { translate, type TranslationVars } from '../shared/i18n.js';
import type { SyncStatusState } from '../shared/contracts/syncStatus.js';

const client = vi.hoisted(() => ({
  getCollection: vi.fn(), getCustomFields: vi.fn(), getCollectionFolders: vi.fn(),
  getCollectionValue: vi.fn(), getInventory: vi.fn(),
}));
vi.mock('../server/discogs.js', () => ({ createDiscogsClient: () => client }));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-sync-completion-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser, clearUserCollectionData, upsertDiscogsAccount } = await import('../server/db.js');
const { default: router } = await import('../server/routes/sync.js');
let server: Server;
let baseUrl: string;
let userId: number;
let coverResponse: (init?: RequestInit) => Promise<Response>;
let coverEntered = false;
let source: Buffer;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const collection = (covers = 1) => ({ pagination: { page: 1, per_page: 100, pages: 1, items: covers }, releases: Array.from({ length: covers }, (_, i) => ({
  instance_id: 1001 + i, date_added: `2026-01-0${i + 1}`, basic_information: {
    id: 101 + i, title: 'Fixture', artists: [{ name: 'Fixture' }], cover_image: 'https://i.discogs.com/fixture.jpg',
  },
})) });
const emptyInventory = { pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, listings: [] };
const image = () => new Response(new Uint8Array(source), { headers: { 'content-type': 'image/png' } });
async function api(method = 'POST') {
  return fetch(`${baseUrl}${method === 'GET' ? '/status' : ''}`, { method });
}
async function state(): Promise<SyncStatusState> { return (await api('GET')).json(); }
function log() {
  return db.prepare<[number], { status: string; records_synced: number; finished_at: string | null }>(
    'SELECT status, records_synced, finished_at FROM sync_log WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
}
async function until(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 2000, interval: 5 });
}
async function terminal() {
  await vi.waitFor(async () => expect((await state()).isTerminal).toBe(true), { timeout: 2000, interval: 5 });
}
beforeAll(async () => {
  source = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith('http://127.0.0.1:')) return realFetch(input, init);
    if (String(input) === 'https://i.discogs.com/fixture.jpg') { coverEntered = true; return coverResponse(init); }
    throw new Error('Unexpected external network in sync completion test');
  });
  db.exec(`CREATE TABLE terminal_updates (status TEXT);
    CREATE TRIGGER track_sync_terminal AFTER UPDATE OF status ON sync_log
    WHEN NEW.status IN ('completed', 'failed') BEGIN INSERT INTO terminal_updates VALUES (NEW.status); END;`);
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
  userId = createUser(`fixture-${Date.now()}`, 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  vi.clearAllMocks(); db.exec('DELETE FROM terminal_updates'); coverEntered = false;
  coverResponse = async () => image();
  client.getCollection.mockResolvedValue(collection());
  client.getCustomFields.mockResolvedValue({ fields: [] });
  client.getCollectionFolders.mockResolvedValue({ folders: [] });
  client.getCollectionValue.mockResolvedValue({});
  client.getInventory.mockResolvedValue(emptyInventory);
});
afterAll(async () => {
  deleteUser(userId);
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

it('keeps status and log active, excludes a second POST through inventory and thumbnail warmup, and completes once', async () => {
  const inventory = deferred<unknown>(); const cover = deferred<Response>();
  client.getInventory.mockReturnValueOnce(inventory.promise);
  let covers = 0; coverResponse = () => covers++ === 0 ? cover.promise : Promise.resolve(image());
  expect((await api()).status).toBe(200);
  await until(() => client.getInventory.mock.calls.length === 1);
  const inventoryState = await state(); const inventoryLog = log(); const inventoryConflict = (await api()).status;
  inventory.resolve(emptyInventory); await until(() => coverEntered);
  const warmupState = await state(); const warmupLog = log(); const warmupConflict = (await api()).status;
  cover.resolve(image()); await terminal();
  expect(inventoryState).toMatchObject({ status: 'running', isTerminal: false, finishedAt: null, recordsSynced: 1 });
  expect(inventoryLog).toMatchObject({ status: 'running', finished_at: null }); expect(inventoryConflict).toBe(409);
  expect(warmupState).toMatchObject({ status: 'running', isTerminal: false, finishedAt: null, thumbnails: { status: 'running' } });
  expect(warmupLog).toMatchObject({ status: 'running', finished_at: null }); expect(warmupConflict).toBe(409);
  expect(await state()).toMatchObject({ status: 'completed', recordsSynced: 1, inventory: { status: 'completed' }, thumbnails: { status: 'completed' } });
  expect(log()).toMatchObject({ status: 'completed', records_synced: 1, finished_at: expect.any(String) });
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([{ status: 'completed' }]);
  expect(existsSync(join(dataDir, 'covers', String(userId), '1-wall.jpg'))).toBe(true);
  expect((await api()).status).toBe(200); await terminal();
});

it('propagates inventory failure into one failed terminal result and releases ownership for retry', async () => {
  client.getInventory.mockRejectedValueOnce(new Error('inventory unavailable'));
  await api(); await terminal();
  expect(await state()).toMatchObject({ status: 'failed', recordsSynced: 1, inventory: { status: 'failed' }, message: expect.stringContaining('inventory unavailable') });
  expect(log()).toMatchObject({ status: 'failed', records_synced: 1, finished_at: expect.any(String) });
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([{ status: 'failed' }]);
  expect(coverEntered).toBe(false);
  expect((await api()).status).toBe(200); await terminal();
  expect((await state()).status).toBe('completed');
});

it('continues remaining thumbnail warmup but reports partial failure rather than successful completion', async () => {
  client.getCollection.mockResolvedValue(collection(2));
  let attempts = 0;
  coverResponse = async () => { if (attempts++ === 0) throw new Error('cover unavailable'); return image(); };
  await api(); await terminal();
  expect(await state()).toMatchObject({ status: 'failed', recordsSynced: 2, thumbnails: { status: 'failed', current: 2, total: 2, message: expect.stringContaining('1') } });
  expect(log()).toMatchObject({ status: 'failed', records_synced: 2 });
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([{ status: 'failed' }]);
  const row = db.prepare<[number], { id: number }>('SELECT id FROM releases WHERE user_id = ? AND instance_id = 1001').get(userId)!;
  expect(existsSync(join(dataDir, 'covers', String(userId), `${row.id}-poster.jpg`))).toBe(true);
  expect((await api()).status).toBe(200); await terminal();
  expect((await state()).status).toBe('completed');
});

it.each([['inventory', 'resolve'], ['inventory', 'reject'], ['warmup', 'resolve'], ['warmup', 'reject']] as const)(
  'late cancelled %s %s cannot finalize or unlock a replacement run', async (followup, outcome) => {
  const inventory = deferred<unknown>(); const cover = deferred<Response>(); const replacement = deferred<unknown>();
  const bodyDisposed = deferred<void>();
  const response = new Response(new ReadableStream({ cancel() { bodyDisposed.resolve(); } }));
  const bodyRead = vi.spyOn(response.body!, 'getReader');
  if (followup === 'inventory') client.getInventory.mockReturnValueOnce(inventory.promise);
  else coverResponse = () => cover.promise;
  await api(); await until(() => followup === 'inventory' ? client.getInventory.mock.calls.length === 1 : coverEntered);
  const oldRow = db.prepare<[number], { id: number }>('SELECT id FROM releases WHERE user_id = ?').get(userId)!;
  clearUserCollectionData(userId);
  client.getCollection.mockReturnValueOnce(replacement.promise);
  expect((await api()).status).toBe(200);
  if (followup === 'inventory') {
    outcome === 'resolve' ? inventory.resolve(emptyInventory) : inventory.reject(new Error('cancelled inventory failed'));
  } else {
    outcome === 'resolve' ? cover.resolve(response) : cover.reject(new Error('cancelled cover failed'));
  }
  await (followup === 'inventory' ? inventory.promise : cover.promise).catch(() => undefined);
  if (followup === 'warmup' && outcome === 'resolve') {
    await bodyDisposed.promise;
    expect(bodyRead).not.toHaveBeenCalled();
  }
  // The controlled response has no pending I/O. The local HTTP request runs after
  // its cancellation continuations drain, while replacement collection work stays held.
  expect(await state()).toMatchObject({ status: 'running', phase: 'initializing', thumbnails: { status: 'idle' } });
  expect(log()).toMatchObject({ status: 'running', finished_at: null });
  expect((await api()).status).toBe(409);
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([]);
  expect(db.prepare('SELECT * FROM releases WHERE user_id = ?').all(userId)).toEqual([]);
  expect(existsSync(join(dataDir, 'covers', String(userId), `${oldRow.id}-wall.jpg`))).toBe(false);
  replacement.resolve({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] }); await terminal();
  expect((await state()).status).toBe('completed');
});


it('account reset cancels an active warmup body without stale covers or replacement status writes', async () => {
  let cancelled = false; let signal: AbortSignal | null | undefined;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  coverResponse = async init => { signal = init?.signal; return response; };
  await api(); await until(() => coverEntered);
  const oldRow = db.prepare<[number], { id: number }>('SELECT id FROM releases WHERE user_id = ?').get(userId)!;
  clearUserCollectionData(userId);
  const replacement = deferred<unknown>(); client.getCollection.mockReturnValueOnce(replacement.promise);
  expect((await api()).status).toBe(200);
  await until(() => cancelled);
  expect(signal?.aborted).toBe(true); expect(response.body?.locked).toBe(false);
  expect(await state()).toMatchObject({ status: 'running', phase: 'initializing', thumbnails: { status: 'idle' } });
  expect(log()).toMatchObject({ status: 'running', finished_at: null });
  expect(existsSync(join(dataDir, 'covers', String(userId), `${oldRow.id}-wall.jpg`))).toBe(false);
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([]);
  coverResponse = async () => image(); replacement.resolve(collection()); await terminal();
  expect((await state()).status).toBe('completed');
  expect(readdirSync(join(dataDir, 'covers', String(userId))).every(file => file.endsWith('.jpg'))).toBe(true);
});

it.each(['fetch', 'body'] as const)('warmup reports a failed terminal result when a held %s exceeds the cover deadline', async stage => {
  let signal: AbortSignal | null | undefined; let cancelled = false;
  coverResponse = init => {
    signal = init?.signal;
    return stage === 'fetch' ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await api(); await until(() => coverEntered);
    await vi.advanceTimersByTimeAsync(30_000);
  } finally { vi.useRealTimers(); }
  await terminal();
  expect(signal?.aborted).toBe(true); if (stage === 'body') expect(cancelled).toBe(true);
  expect(await state()).toMatchObject({ status: 'failed', thumbnails: { status: 'failed', current: 1, total: 1 } });
  expect(log()).toMatchObject({ status: 'failed', finished_at: expect.any(String) });
  expect(db.prepare('SELECT * FROM terminal_updates').all()).toEqual([{ status: 'failed' }]);
  expect(readdirSync(join(dataDir, 'covers', String(userId)))).toEqual([]);
  coverResponse = async () => image(); expect((await api()).status).toBe(200); await terminal();
  expect((await state()).status).toBe('completed');
});
