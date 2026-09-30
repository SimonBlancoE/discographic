import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';

const exchange = vi.hoisted(() => vi.fn());
vi.mock('../server/services/exchangeRates.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/services/exchangeRates.js')>(),
  getExchangeSnapshot: exchange,
}));
const client = vi.hoisted(() => ({
  getCollection: vi.fn(), getCustomFields: vi.fn(), getCollectionFolders: vi.fn(),
  getCollectionValue: vi.fn(), getInventory: vi.fn(), getRelease: vi.fn(),
  getMarketplaceStats: vi.fn(), updateRating: vi.fn(), updateField: vi.fn(), moveToFolder: vi.fn(),
}));
vi.mock('../server/discogs.js', () => ({ createDiscogsClient: () => client }));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-job-ownership-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, clearUserCollectionData, deleteUser, upsertDiscogsAccount, getCollectionFieldMap } = await import('../server/db.js');
const { startRadarUpdateRun, stopRadarUpdateRun } = await import('../server/services/radarUpdateRun.js');
const { getRadarUpdateRunState, isRadarUpdateRunRunning } = await import('../server/services/radarRuntimeState.js');
const { startRadarEnrichment, stopRadarEnrichment } = await import('../server/services/radarEnrichmentWorkflow.js');
const { syncRadarWantlist } = await import('../server/services/radarWantlist.js');
const routers = await Promise.all(['sync', 'collection', 'import', 'radar', 'account'].map(name => import(`../server/routes/${name}.ts`)));
let server: Server;
let baseUrl: string;
let userId: number;
let uploadEntered = false;
const want = (id: number) => ({ id, basic_information: { id, title: 'Fixture', artists: [{ name: 'Fixture' }] } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 25));
async function until(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 2000, interval: 5 });
}
function seed() {
  db.prepare(`INSERT INTO releases (id,user_id,release_id,instance_id,title,artist,rating,notes,folder_id)
    VALUES (11,?,101,1001,'Fixture','Fixture',1,'[]',1)`).run(userId);
}
async function api(path: string, body?: object, method = 'POST') {
  return fetch(`${baseUrl}/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function preview() {
  const form = new FormData();
  form.append('file', new Blob(['ID,Rating,Notes\n11,5,new note\n']), 'fixture.csv');
  const response = await fetch(`${baseUrl}/import/preview`, { method: 'POST', body: form });
  return response.json() as Promise<{ previewId: string }>;
}
beforeAll(async () => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    if (!String(input).startsWith('http://127.0.0.1:')) throw new Error('Unexpected external network in ownership test');
    return realFetch(input, init);
  });
  const app = express(); app.use(express.json());
  app.use(session({ secret: 'temporary-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.userId = userId; req.session.authEpoch = 0; req.locale = 'en';
    req.t = (key, vars) => translate('en', key, vars as TranslationVars); next();
    if (req.get('x-test-held-upload')) uploadEntered = true;
  });
  ['sync','collection','import','radar','account'].forEach((name, i) => app.use(`/${name}`, routers[i].default));
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
    baseUrl = `http://127.0.0.1:${address.port}`; resolve();
  }); });
});
beforeEach(() => {
  if (userId) deleteUser(userId);
  userId = createUser(`fixture-${Date.now()}`, 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  vi.clearAllMocks();
  exchange.mockResolvedValue({ rates: { EUR: 1, GBP: 0.8 }, base: 'EUR' });
  client.getCollection.mockResolvedValue({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] });
  client.getCustomFields.mockResolvedValue({ fields: [{ id: 3, name: 'Notes', type: 'textarea' }] });
  client.getCollectionFolders.mockResolvedValue({ folders: [] });
  client.getCollectionValue.mockResolvedValue({});
  client.getInventory.mockResolvedValue({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, listings: [] });
  client.getRelease.mockResolvedValue({ country: 'OLD', tracklist: [] });
  client.getMarketplaceStats.mockResolvedValue({ lowest_price: { value: 99 } });
  client.updateRating.mockResolvedValue({}); client.updateField.mockResolvedValue({});
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});
it.each(['resolve', 'reject'] as const)('Radar late %s cannot overwrite replacement state or release its lock', async outcome => {
  const old = deferred<unknown[]>(); const replacement = deferred<unknown[]>();
  startRadarUpdateRun({ db, userId, locale: 'en', discogs: { getAllWantlist: () => old.promise } });
  stopRadarUpdateRun(db, userId, 'en');
  startRadarUpdateRun({ db, userId, locale: 'en', discogs: { getAllWantlist: () => replacement.promise } });
  outcome === 'resolve' ? old.resolve([want(901)]) : old.reject(new Error('late failure'));
  await settle();
  const running = isRadarUpdateRunRunning(userId);
  const state = getRadarUpdateRunState(userId);
  const rows = db.prepare('SELECT release_id FROM radar_releases WHERE user_id = ?').all(userId);
  replacement.resolve([want(902)]); await settle();
  expect(running).toBe(true); expect(state?.phase).toBe('syncing'); expect(rows).toEqual([]);
});
it.each(['reset', 'delete'] as const)('Radar cannot restore account rows after %s', async action => {
  const held = deferred<unknown[]>();
  startRadarUpdateRun({ db, userId, locale: 'en', discogs: { getAllWantlist: () => held.promise } });
  action === 'reset' ? clearUserCollectionData(userId) : deleteUser(userId);
  held.resolve([want(901)]); await settle();
  expect(db.prepare('SELECT release_id FROM radar_releases WHERE user_id = ?').all(userId)).toEqual([]);
  expect(getRadarUpdateRunState(userId)).toBeNull();
});
it.each(['getCollection', 'getCustomFields', 'getCollectionValue', 'getInventory'] as const)('sync ignores %s after account reset', async method => {
  const held = deferred<unknown>(); client[method].mockReturnValue(held.promise);
  await api('sync', {}); await until(() => client[method].mock.calls.length > 0);
  clearUserCollectionData(userId); seed();
  db.prepare("UPDATE releases SET listing_status = 'replacement' WHERE user_id = ?").run(userId);
  const payload = method === 'getCollection' ? { pagination: { page: 1, per_page: 100, pages: 1, items: 1 }, releases: [{ instance_id: 99, basic_information: { id: 99 } }] }
    : method === 'getCustomFields' ? { fields: [{ id: 99, name: 'Notes', type: 'textarea' }] }
    : method === 'getInventory' ? { pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, listings: [] } : { minimum: '€10', median: '€20', maximum: '€30' };
  held.resolve(payload); await settle();
  expect(getCollectionFieldMap(userId).notesFieldId).toBe(3);
  expect(db.prepare('SELECT instance_id, listing_status FROM releases WHERE user_id = ?').all(userId)).toEqual([{ instance_id: 1001, listing_status: 'replacement' }]);
  expect(db.prepare('SELECT * FROM collection_value_snapshots WHERE user_id = ?').all(userId)).toEqual([]);
  expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'idle' });
});
it.each(['sync/enrich', 'sync/community', 'collection/11'] as const)('%s ignores stale release detail', async path => {
  seed(); const held = deferred<unknown>(); client.getRelease.mockReturnValue(held.promise);
  const request = api(path, path === 'collection/11' ? undefined : {}, path === 'collection/11' ? 'GET' : 'POST');
  await until(() => client.getRelease.mock.calls.length > 0);
  clearUserCollectionData(userId); seed(); held.resolve({ country: 'OLD', community: { have: 99 }, tracklist: [] });
  await request; await settle();
  expect(db.prepare('SELECT country FROM releases WHERE user_id = ?').get(userId)).toEqual({ country: null });
  expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'idle' });
});
it('collection metadata cannot restore old field definitions', async () => {
  const held = deferred<unknown>(); client.getCustomFields.mockReturnValue(held.promise);
  const request = api('collection/meta', undefined, 'GET'); await until(() => client.getCustomFields.mock.calls.length > 0);
  clearUserCollectionData(userId); held.resolve({ fields: [{ id: 99, name: 'Notes', type: 'textarea' }] }); await request;
  expect(getCollectionFieldMap(userId).notesFieldId).toBe(3);
});
it('collection edit cannot mirror an old write onto replacement rows or send further edits', async () => {
  seed(); const held = deferred<unknown>(); client.updateRating.mockReturnValue(held.promise);
  const request = api('collection/11', { rating: 5, notes: 'old account' }, 'PUT');
  await until(() => client.updateRating.mock.calls.length > 0);
  clearUserCollectionData(userId); seed(); held.resolve({}); await request;
  expect(db.prepare('SELECT rating, notes FROM releases WHERE user_id = ?').get(userId)).toEqual({ rating: 1, notes: '[]' });
  expect(client.updateField).not.toHaveBeenCalled();
});
it('reset expires import previews', async () => {
  seed(); const cached = await preview(); clearUserCollectionData(userId); seed();
  expect((await api('import/apply', cached)).status).toBe(410);
  expect(db.prepare('SELECT rating FROM releases WHERE user_id = ?').get(userId)).toEqual({ rating: 1 });
});
it.each(['resolve','reject'] as const)('import late %s cannot restore status or continue outbound edits', async outcome => {
  seed(); const held = deferred<unknown>(); client.updateRating.mockReturnValue(held.promise);
  await api('import/apply', await preview()); await until(() => client.updateRating.mock.calls.length > 0);
  clearUserCollectionData(userId); seed();
  outcome === 'resolve' ? held.resolve({}) : held.reject(new Error('late error'));
  await settle();
  expect(await (await api('import/status', undefined, 'GET')).json()).toMatchObject({ status: 'idle' });
  expect(client.updateField).not.toHaveBeenCalled();
});
it('Radar enrichment cannot mutate a replacement row after stop', async () => {
  syncRadarWantlist(db, userId, [want(901)]);
  const held = deferred<{ lowest_price: { value: number } }>();
  startRadarEnrichment({ db, userId, locale: 'en', discogs: { getMarketplaceStats: () => held.promise } });
  stopRadarEnrichment(db, userId, 'en'); held.resolve({ lowest_price: { value: 99 } }); await settle();
  expect(db.prepare('SELECT estimated_price FROM radar_releases WHERE user_id = ?').get(userId)).toEqual({ estimated_price: null });
});

it.each(['resolve', 'reject'] as const)('sync late %s cannot clobber a replacement run', async outcome => {
  const old = deferred<unknown>(); const replacement = deferred<unknown>();
  client.getCollection.mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
  await api('sync', {}); clearUserCollectionData(userId); await api('sync', {});
  outcome === 'resolve' ? old.resolve({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] }) : old.reject(new Error('late failure'));
  await settle();
  expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'running', phase: 'initializing' });
  expect((await api('sync', {})).status).toBe(409);
  replacement.resolve({ pagination: { page: 1, per_page: 100, pages: 1, items: 0 }, releases: [] }); await settle();
});
it('import old completion cannot clobber another confirmed preview', async () => {
  seed(); const old = deferred<unknown>(); const replacement = deferred<unknown>();
  client.updateRating.mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
  await api('import/apply', await preview());
  db.prepare('UPDATE releases SET rating = 1, notes = ? WHERE id = 11').run('[]');
  await api('import/apply', await preview());
  old.resolve({}); await settle();
  expect(await (await api('import/status', undefined, 'GET')).json()).toMatchObject({ status: 'running', current: 0 });
  expect(client.updateField).not.toHaveBeenCalled();
  replacement.resolve({}); await settle();
  expect(await (await api('import/status', undefined, 'GET')).json()).toMatchObject({ status: 'completed' });
});
it('Radar preview apply cannot restore rows when reset occurs during currency conversion', async () => {
  const { createRadarWantlistImportPreview, applyStoredRadarWantlistPreview } = await import('../server/services/radarWantlistImport.js');
  const cached = createRadarWantlistImportPreview({ userId, displayCurrency: 'GBP', filename: 'wanted.csv',
    buffer: Buffer.from('release_id,title,target_price\n901,Fixture,10\n'), t: key => key });
  expect(cached.previewId).toBeTruthy();
  const held = deferred<unknown>(); exchange.mockReturnValue(held.promise);
  const request = applyStoredRadarWantlistPreview({ db, userId, previewId: cached.previewId! });
  clearUserCollectionData(userId); held.resolve({ rates: { EUR: 1, GBP: 0.8 } });
  await expect(request).rejects.toThrow('cancelled');
  expect(db.prepare('SELECT * FROM radar_releases WHERE user_id = ?').all(userId)).toEqual([]);
});
it('Radar local edits cannot overwrite replacement decisions after currency conversion', async () => {
  syncRadarWantlist(db, userId, [want(901)]);
  const row = db.prepare<[], { id: number }>('SELECT id FROM radar_releases').get()!;
  const held = deferred<unknown>(); exchange.mockReturnValue(held.promise);
  const request = api(`radar/${row.id}`, { local: { target_price: 10, priority: 'normal', minimum_condition: null, note: '', hidden: false, resolved: false } }, 'PUT');
  await until(() => exchange.mock.calls.length > 0);
  clearUserCollectionData(userId);
  syncRadarWantlist(db, userId, [want(902)]);
  db.prepare("UPDATE radar_releases SET id = ?, local_target_price_eur = 77, local_note = 'replacement' WHERE user_id = ?").run(row.id, userId);
  held.resolve({ rates: { EUR: 1, GBP: 0.8 } }); await request;
  expect(db.prepare('SELECT local_target_price_eur, local_note FROM radar_releases WHERE user_id = ?').get(userId))
    .toEqual({ local_target_price_eur: 77, local_note: 'replacement' });
});
it('account-specific price suggestions discard old cached responses on reset', async () => {
  const { getPriceSuggestions } = await import('../server/services/priceSuggestions.js');
  const held = deferred<unknown>();
  const input = { userId, releaseId: 101, convert: async (amount: number, currency: string) => ({ amount, currency }) };
  const request = getPriceSuggestions({ ...input, discogs: { getPriceSuggestions: () => held.promise } });
  clearUserCollectionData(userId);
  held.resolve({ 'Mint (M)': { currency: 'EUR', value: 99 } }); await request;
  const fresh = await getPriceSuggestions({ ...input, discogs: { getPriceSuggestions: async () => ({ 'Mint (M)': { currency: 'EUR', value: 7 } }) } });
  expect(fresh).toMatchObject({ available: true, suggestions: [{ value: 7 }] });
});

it('cover download cannot recreate old account files after reset', async () => {
  const { ensureCachedCover } = await import('../server/services/coverMedia.js');
  const { default: sharp } = await import('sharp');
  const source = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const held = deferred<Response>();
  const originalFetch = globalThis.fetch;
  let entered = false;
  vi.stubGlobal('fetch', async () => { entered = true; return held.promise; });
  try {
    const request = ensureCachedCover({ userId, release: { id: 11, cover_url: 'https://i.discogs.com/fixture.jpg' }, variant: 'wall' });
    await until(() => entered);
    clearUserCollectionData(userId);
    held.resolve(new Response(new Uint8Array(source), { headers: { 'content-type': 'image/png' } }));
    await request.catch(() => undefined);
    expect(existsSync(join(dataDir, 'covers', String(userId), '11-wall.jpg'))).toBe(false);
  } finally { vi.stubGlobal('fetch', originalFetch); }
});
it.each(['enrich', 'community'])('stopping %s reports a terminal state immediately while upstream remains pending', async kind => {
  seed(); const held = deferred<unknown>(); client.getRelease.mockReturnValue(held.promise);
  await api(`sync/${kind}`, {}); await until(() => client.getRelease.mock.calls.length > 0);
  await api(`sync/${kind}/stop`, {});
  const state = await (await api(kind === 'enrich' ? 'sync/status' : 'sync/community', undefined, 'GET')).json();
  held.resolve({}); await settle();
  expect(kind === 'enrich' ? state.enrichment.status : state.status).toBe('completed');
});

it.each(['sync/enrich', 'collection/11'])('%s ignores marketplace responses after reset', async path => {
  seed(); const held = deferred<unknown>(); client.getMarketplaceStats.mockReturnValue(held.promise);
  const request = api(path, path === 'collection/11' ? undefined : {}, path === 'collection/11' ? 'GET' : 'POST');
  await until(() => client.getMarketplaceStats.mock.calls.length > 0);
  clearUserCollectionData(userId); seed(); held.resolve({ lowest_price: { value: 99 } });
  await request; await settle();
  expect(db.prepare('SELECT estimated_value FROM releases WHERE user_id = ?').get(userId)).toEqual({ estimated_value: null });
});
it.each(['enrich', 'community'])('old %s failure cannot finish a replacement job', async kind => {
  seed(); const old = deferred<unknown>(); const replacement = deferred<unknown>();
  client.getRelease.mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
  await api(`sync/${kind}`, {}); await api(`sync/${kind}/stop`, {}); await api(`sync/${kind}`, {});
  old.reject(new Error('late failure')); await settle();
  expect((await api(`sync/${kind}`, {})).status).toBe(409);
  const state = await (await api(kind === 'enrich' ? 'sync/status' : 'sync/community', undefined, 'GET')).json();
  expect(kind === 'enrich' ? state.enrichment.status : state.status).toBe('running');
  replacement.resolve({}); await settle();
});
it('old Radar enrichment completion cannot clear a replacement lock or mutate its row', async () => {
  syncRadarWantlist(db, userId, [want(901)]);
  const old = deferred<{ lowest_price: { value: number } }>();
  const replacement = deferred<{ lowest_price: { value: number } }>();
  const input = { db, userId, locale: 'en' };
  startRadarEnrichment({ ...input, discogs: { getMarketplaceStats: () => old.promise } });
  stopRadarEnrichment(db, userId, 'en');
  startRadarEnrichment({ ...input, discogs: { getMarketplaceStats: () => replacement.promise } });
  old.resolve({ lowest_price: { value: 99 } }); await settle();
  expect(startRadarEnrichment({ ...input, discogs: { getMarketplaceStats: () => replacement.promise } })).toBe(false);
  expect(db.prepare('SELECT estimated_price FROM radar_releases WHERE user_id = ?').get(userId)).toEqual({ estimated_price: null });
  replacement.resolve({ lowest_price: { value: 7 } }); await settle();
  expect(db.prepare('SELECT estimated_price FROM radar_releases WHERE user_id = ?').get(userId)).toEqual({ estimated_price: 7 });
});

it.each(['account', 'account/reset'])('%s invalidates work through the actual account route', async path => {
  const held = deferred<unknown>(); client.getCustomFields.mockReturnValue(held.promise);
  await api('sync', {}); await until(() => client.getCustomFields.mock.calls.length > 0);
  const response = await api(path, path === 'account' ? { discogsUsername: 'replacement', discogsToken: 'new-fixture-token' } : {}, path === 'account' ? 'PUT' : 'POST');
  expect(response.status).toBe(200);
  held.resolve({ fields: [{ id: 99, name: 'Notes', type: 'textarea' }] }); await settle();
  expect(getCollectionFieldMap(userId).notesFieldId).toBe(3);
  expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'idle' });
});
it.each(['import/preview', 'radar/wantlist/preview'])('%s rejects uploads that began before account reset', async path => {
  seed(); uploadEntered = false;
  const boundary = 'ownership-fixture-boundary';
  let finishUpload!: () => void;
  const response = new Promise<number>((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/${path}`, { method: 'POST', headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`, 'x-test-held-upload': '1',
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode!)); });
    request.on('error', reject);
    request.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.csv"\r\nContent-Type: text/csv\r\n\r\n`);
    finishUpload = () => request.end(`ID,release_id,Rating\n11,901,5\n\r\n--${boundary}--\r\n`);
  });
  await until(() => uploadEntered);
  clearUserCollectionData(userId); seed(); finishUpload();
  expect(await response).toBe(400);
});
it('cover composition cannot start another old-account download after reset', async () => {
  const { generateTapeteImage } = await import('../server/services/coverMedia.js');
  const { default: sharp } = await import('sharp');
  const source = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const held = deferred<Response>(); const originalFetch = globalThis.fetch; let calls = 0;
  vi.stubGlobal('fetch', async () => {
    calls += 1;
    return calls === 1 ? held.promise : new Response(new Uint8Array(source));
  });
  try {
    const request = generateTapeteImage({ userId, maxSize: 100, releases: [
      { id: 11, cover_url: 'https://i.discogs.com/fixture.jpg' },
      { id: 12, cover_url: 'https://i.discogs.com/fixture2.jpg' },
    ] });
    await until(() => calls === 1); clearUserCollectionData(userId);
    held.resolve(new Response(new Uint8Array(source))); await request.catch(() => undefined);
    expect(calls).toBe(1);
    expect(existsSync(join(dataDir, 'covers', String(userId), '12-tapete.jpg'))).toBe(false);
  } finally { vi.stubGlobal('fetch', originalFetch); }
});
