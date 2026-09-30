import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';
import type { SyncStatusState } from '../shared/contracts/syncStatus.js';

// Controlled upstream fixtures have no remote quota or ECB network dependency.
vi.mock('../server/middleware/rateLimit.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/middleware/rateLimit.js')>(),
  createDiscogsRateLimiter: () => async () => undefined,
}));
vi.mock('../server/services/exchangeRates.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/services/exchangeRates.js')>(),
  getExchangeSnapshot: async () => ({ rates: { EUR: 1, GBP: 0.8 }, base: 'EUR' }),
}));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-inventory-snapshot-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser, upsertDiscogsAccount } = await import('../server/db.js');
const { default: router } = await import('../server/routes/sync.js');
let server: Server;
let baseUrl: string;
let userId: number;
let otherUserId: number;
let inventoryPages: unknown[];
let inventoryResponse: ((page: number) => Promise<unknown>) | undefined;

const listing = (id: number, releaseId = 101, status = 'For Sale', value: number | null = 20, currency = 'EUR') => ({
  id, release: { id: releaseId }, status, price: value === null ? {} : { value, currency },
});
const inventory = (listings: unknown[], page = 1, items = listings.length, pages = Math.ceil(items / 100)) => ({
  pagination: { page, per_page: 100, pages, items }, listings,
});
const fullPage = Array.from({ length: 100 }, (_, i) => listing(1000 + i));
const collection = {
  pagination: { page: 1, per_page: 100, pages: 1, items: 2 },
  releases: [101, 102].map(id => ({
    instance_id: id + 1000, date_added: '2026-01-01',
    basic_information: { id, title: 'Fixture', artists: [{ name: 'Fixture' }] },
  })),
};
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const listingFields = () => db.prepare(`SELECT user_id, instance_id, listing_status, listing_price,
  listing_currency, listing_price_eur FROM releases ORDER BY user_id, instance_id`).all();
async function state(): Promise<SyncStatusState> { return (await fetch(`${baseUrl}/status`)).json(); }
async function start() { expect((await fetch(baseUrl, { method: 'POST' })).status).toBe(200); }
async function terminal() {
  await vi.waitFor(async () => expect((await state()).isTerminal).toBe(true), { timeout: 2000, interval: 5 });
  return state();
}
beforeAll(async () => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === baseUrl) return realFetch(input, init);
    if (url.origin !== 'https://api.discogs.com' || (init?.method && init.method !== 'GET')) {
      throw new Error('Unexpected external request in inventory snapshot test');
    }
    if (url.pathname.endsWith('/collection/folders/0/releases')) return json(collection);
    if (url.pathname.endsWith('/collection/fields')) return json({ fields: [] });
    if (url.pathname.endsWith('/collection/folders')) return json({ folders: [] });
    if (url.pathname.endsWith('/collection/value')) return json({});
    if (url.pathname.endsWith('/inventory')) {
      const page = Number(url.searchParams.get('page'));
      return json(inventoryResponse ? await inventoryResponse(page) : inventoryPages[page - 1]);
    }
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
  userId = createUser(`inventory-${Date.now()}`, 'unused').id;
  otherUserId = createUser(`other-${Date.now()}`, 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  const insert = db.prepare(`INSERT INTO releases (user_id,release_id,instance_id,title,artist,
    listing_status,listing_price,listing_currency,listing_price_eur) VALUES (?,?,?,'Keep','Keep','For Sale',32,'GBP',40)`);
  insert.run(userId, 101, 1101); insert.run(userId, 102, 1102); insert.run(otherUserId, 101, 1101);
  inventoryPages = [inventory([])]; inventoryResponse = undefined;
});
afterAll(async () => {
  deleteUser(userId); deleteUser(otherUserId);
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

describe('production inventory snapshot reconciliation', () => {
  it.each([
    ['HTTP 200 empty object', [{}]],
    ['null envelope', [null]],
    ['missing pagination', [{ listings: [] }]],
    ['missing listings', [{ pagination: inventory([]).pagination }]],
    ['invalid listings', [{ ...inventory([]), listings: {} }]],
    ['missing page', [{ ...inventory([]), pagination: { per_page: 100, pages: 0, items: 0 } }]],
    ['missing page size', [{ ...inventory([]), pagination: { page: 1, pages: 0, items: 0 } }]],
    ['missing items', [{ ...inventory([]), pagination: { page: 1, per_page: 100, pages: 0 } }]],
    ['missing pages', [{ ...inventory([]), pagination: { page: 1, per_page: 100, items: 0 } }]],
    ['wrong page number', [inventory([listing(1)], 2)]],
    ['short first page', [inventory([listing(1)], 1, 2)]],
    ['inflated pages', [inventory([listing(1)], 1, 1, 2)]],
    ['duplicate listing', [inventory([listing(1), listing(1)])]],
    ['missing listing identity', [inventory([{ release: { id: 101 } }])]],
    ['invalid listing identity', [inventory([listing(-1)])]],
    ['invalid release identity', [inventory([listing(1, 0)])]],
    ['string listing identity', [inventory([{ ...listing(1), id: '1' }])]],
    ['fractional release identity', [inventory([listing(1, 101.5)])]],
    ['missing second page', [inventory(fullPage, 1, 101), null]],
    ['truncated second page', [inventory(fullPage, 1, 102), inventory([listing(2000)], 2, 102)]],
    ['cross-page duplicate listing', [inventory(fullPage, 1, 101), inventory([listing(1000)], 2, 101)]],
    ['changing totals', [inventory(fullPage, 1, 101), inventory([listing(2000), listing(2001)], 2, 102)]],
  ])('preserves every prior listing field and fails the whole run for %s', async (_name, pages) => {
    inventoryPages = pages;
    const before = listingFields();
    await start(); const status = await terminal();
    expect(listingFields()).toEqual(before);
    expect(status).toMatchObject({ status: 'failed', inventory: { status: 'failed' }, message: expect.stringMatching(/inventory/i) });
    expect(db.prepare('SELECT status,finished_at FROM sync_log WHERE user_id = ?').get(userId))
      .toMatchObject({ status: 'failed', finished_at: expect.any(String) });
  });

  it.each([0, 1])('clears listings only for the syncing account for valid empty inventory with %i pages', async pages => {
    inventoryPages = [inventory([], 1, 0, pages)];
    const otherBefore = listingFields()[2];
    await start(); expect(await terminal()).toMatchObject({ status: 'completed', inventory: { status: 'completed' } });
    expect(listingFields().slice(0, 2)).toEqual([1101, 1102].map(instance_id => ({
      user_id: userId, instance_id, listing_status: null, listing_price: null, listing_currency: null, listing_price_eur: null,
    })));
    expect(listingFields()[2]).toEqual(otherBefore);
  });

  it('accepts distinct listings for one release and preserves status and converted-price selection', async () => {
    inventoryPages = [inventory([
      listing(1, 101, 'Draft', 1), listing(2, 101, 'For Sale', 20), listing(3, 101, 'For Sale', 15, 'GBP'),
      listing(4, 102, 'Draft', null),
    ])];
    const otherBefore = listingFields()[2];
    await start(); expect((await terminal()).status).toBe('completed');
    expect(listingFields()[0]).toMatchObject({ listing_status: 'For Sale', listing_price: 15, listing_currency: 'GBP', listing_price_eur: 18.75 });
    expect(listingFields()[1]).toMatchObject({ listing_status: 'Draft', listing_price: null, listing_currency: null, listing_price_eur: null });
    expect(listingFields()[2]).toEqual(otherBefore);
  });

  it('waits for the complete second page before reconciling and then accepts unique listing coverage', async () => {
    let resolve!: (value: unknown) => void;
    let secondPageEntered = false;
    const held = new Promise<unknown>(done => { resolve = done; });
    inventoryResponse = async page => {
      if (page === 1) return inventory(fullPage, 1, 101);
      secondPageEntered = true; return held;
    };
    const before = listingFields();
    await start(); await vi.waitFor(() => expect(secondPageEntered).toBe(true));
    const during = listingFields(); const duringState = await state();
    resolve(inventory([listing(2000, 102, 'Draft', 10)], 2, 101));
    expect((await terminal()).status).toBe('completed');
    expect(during).toEqual(before); expect(duringState.status).toBe('running');
    expect(listingFields()[1]).toMatchObject({ listing_status: 'Draft', listing_price: 10 });
    expect(listingFields()[2]).toEqual(before[2]);
  });
});
