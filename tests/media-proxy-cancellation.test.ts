import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-media-proxy-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser, clearUserCollectionData } = await import('../server/db.js');
const { default: router } = await import('../server/routes/media.js');
const realFetch = globalThis.fetch;
let server: Server; let baseUrl: string; let userId: number;
let remote: (init?: RequestInit) => Promise<Response>;
let entered = false;
const source = new Uint8Array([1, 2, 3]);
function proxy(url = 'https://i.discogs.com/fixture.jpg') { return realFetch(`${baseUrl}/proxy-image?url=${encodeURIComponent(url)}`); }
beforeAll(async () => {
  vi.stubGlobal('fetch', (_input: string | URL | Request, init?: RequestInit) => { entered = true; return remote(init); });
  const app = express(); app.use(session({ secret: 'temporary-fixture', resave: false, saveUninitialized: false }));
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
  userId = createUser(`fixture-${Date.now()}`, 'unused').id; entered = false;
  remote = async () => new Response(source, { headers: { 'content-type': 'image/png' } });
});
afterAll(async () => {
  deleteUser(userId); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

it('preserves successful authenticated proxy bytes and cache headers', async () => {
  const response = await proxy(); expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(source);
});

it.each(['fetch', 'body'] as const)('account reset aborts proxy %s promptly and leaves a fresh request usable', async stage => {
  let resolve!: (response: Response) => void; let signal: AbortSignal | null | undefined; let cancelled = false;
  const late = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  remote = init => {
    signal = init?.signal;
    return stage === 'fetch' ? new Promise(yes => { resolve = yes; }) : Promise.resolve(late);
  };
  const request = proxy(); let response: Response | undefined; void request.then(value => { response = value; }, () => {});
  await vi.waitFor(() => expect(entered).toBe(true)); clearUserCollectionData(userId);
  await vi.waitFor(() => expect(response?.status).toBe(502));
  expect(signal?.aborted).toBe(true);
  if (stage === 'fetch') resolve(late);
  await vi.waitFor(() => expect(cancelled).toBe(true));
  expect(await response!.json()).toEqual({ error: translate('en', 'backend.media.remoteFetchFailed') });
  remote = async () => new Response(source, { headers: { 'content-type': 'image/png' } });
  expect((await proxy()).status).toBe(200);
});

it('rejects disallowed proxy URLs without contacting upstream', async () => {
  expect((await proxy('https://example.com/fixture.jpg')).status).toBe(400); expect(entered).toBe(false);
});
