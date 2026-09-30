import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';
import { createDiscogsClient } from '../server/discogs.js';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-transport-cancellation-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser, clearUserCollectionData, upsertDiscogsAccount } = await import('../server/db.js');
const { startRadarEnrichment, stopRadarEnrichment } = await import('../server/services/radarEnrichmentWorkflow.js');
const { syncRadarWantlist } = await import('../server/services/radarWantlist.js');
const routers = await Promise.all(['sync', 'collection', 'import', 'radar'].map(name => import(`../server/routes/${name}.ts`)));
let server: Server;
let baseUrl: string;
let userId: number;
const pending: AbortSignal[] = [];
const outbound: string[] = [];
let responseFor: (url: string) => Response | undefined;
async function until(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 1000, interval: 5 });
}
function api(path: string, body?: object, method = 'POST') {
  return fetch(`${baseUrl}/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function seed() {
  db.prepare(`INSERT INTO releases (id,user_id,release_id,instance_id,title,artist,rating,notes,folder_id)
    VALUES (11,?,101,1001,'Fixture','Fixture',1,'[]',1)`).run(userId);
}
async function preview() {
  const form = new FormData();
  form.append('file', new Blob(['ID,Rating,Notes\n11,5,new note\n']), 'fixture.csv');
  return (await fetch(`${baseUrl}/import/preview`, { method: 'POST', body: form })).json() as Promise<{ previewId: string }>;
}
beforeAll(async () => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
    if (!url.startsWith('https://api.discogs.com/')) throw new Error('Unexpected external network');
    outbound.push(url);
    const response = responseFor(url);
    if (response) return Promise.resolve(response);
    const signal = init?.signal;
    if (!signal) throw new Error('Discogs transport has no cancellation signal');
    pending.push(signal);
    return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const app = express(); app.use(express.json());
  app.use(session({ secret: 'temporary-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.userId = userId; req.session.authEpoch = 0; req.locale = 'en';
    req.t = (key, vars) => translate('en', key, vars as TranslationVars); next();
  });
  ['sync', 'collection', 'import', 'radar'].forEach((name, i) => app.use(`/${name}`, routers[i].default));
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
    baseUrl = `http://127.0.0.1:${address.port}`; resolve();
  }); });
});
beforeEach(() => {
  if (userId) deleteUser(userId);
  userId = createUser(`fixture-${Date.now()}`, 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  pending.length = 0; outbound.length = 0; responseFor = () => undefined;
});
afterAll(async () => {
  deleteUser(userId);
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

it.each(['sync/enrich', 'sync/community', 'radar/update'])('%s stop aborts active transport and a replacement owns a fresh signal', async path => {
  seed();
  expect((await api(path)).status).toBe(200);
  await until(() => pending.length === 1);
  const old = pending[0];
  expect((await api(`${path}/stop`)).status).toBe(200);
  expect(old.aborted).toBe(true);
  expect((await api(path)).status).toBe(200);
  await until(() => pending.length === 2);
  expect(pending[1].aborted).toBe(false);
  expect((await api(path)).status).toBe(409);
  await api(`${path}/stop`);
});

it.each(['reset', 'delete'] as const)('account %s aborts an active full sync and cannot revive its state', async action => {
  await api('sync'); await until(() => pending.length === 1);
  action === 'reset' ? clearUserCollectionData(userId) : deleteUser(userId);
  expect(pending[0].aborted).toBe(true);
  if (action === 'reset') {
    await api('sync'); await until(() => pending.length === 2);
    expect(pending[1].aborted).toBe(false);
    expect((await api('sync')).status).toBe(409);
  }
});

it('account reset aborts metadata requests in parallel and inventory follow-up', async () => {
  responseFor = url => url.includes('/collection/folders/0/releases?')
    ? Response.json({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] }) : undefined;
  await api('sync'); await until(() => pending.length === 2);
  clearUserCollectionData(userId);
  expect(pending.every(signal => signal.aborted)).toBe(true);
  pending.length = 0;
  responseFor = url => url.includes('/inventory?') ? undefined : url.includes('/collection/folders/0/releases?')
    ? Response.json({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] }) : Response.json({ fields: [], folders: [] });
  await api('sync'); await until(() => pending.length === 1);
  clearUserCollectionData(userId);
  expect(pending[0].aborted).toBe(true);
});

it('a replaced Import workflow aborts its write and cannot send the next field edit', async () => {
  seed(); await api('import/apply', await preview()); await until(() => pending.length === 1);
  const old = pending[0];
  db.prepare('UPDATE releases SET rating = 1, notes = ? WHERE id = 11').run('[]');
  await api('import/apply', await preview()); await until(() => pending.length === 2);
  expect(old.aborted).toBe(true);
  expect(pending[1].aborted).toBe(false);
  expect(outbound.every(url => !url.includes('/fields/'))).toBe(true);
  clearUserCollectionData(userId);
  expect(pending[1].aborted).toBe(true);
});

it('Radar Marketplace enrichment stop aborts the real client', async () => {
  syncRadarWantlist(db, userId, [{ id: 901, basic_information: { id: 901, title: 'Fixture' } }]);
  startRadarEnrichment({ db, userId, locale: 'en', discogs: createDiscogsClient({ token: 'fixture', username: 'fixture' }) });
  await until(() => pending.length === 1);
  stopRadarEnrichment(db, userId, 'en');
  expect(pending[0].aborted).toBe(true);
  expect(db.prepare('SELECT estimated_price FROM radar_releases WHERE user_id = ?').get(userId)).toEqual({ estimated_price: null });
});

it('account reset aborts a collection edit and prevents any further write', async () => {
  responseFor = url => url.endsWith('/collection/fields') || url.endsWith('/collection/folders')
    ? Response.json({ fields: [], folders: [] }) : undefined;
  seed();
  const request = api('collection/11', { rating: 5, notes: 'old account' }, 'PUT');
  await until(() => pending.length === 1);
  clearUserCollectionData(userId); seed();
  expect(pending[0].aborted).toBe(true);
  await request;
  expect(outbound.filter(url => url.includes('/instances/'))).toHaveLength(1);
  expect(db.prepare('SELECT rating, notes FROM releases WHERE user_id = ?').get(userId)).toEqual({ rating: 1, notes: '[]' });
});
