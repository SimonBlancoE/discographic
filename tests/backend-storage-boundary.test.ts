import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate } from '../shared/i18n.js';

vi.mock('../server/services/exchangeRates.js', async importOriginal => ({
  ...await importOriginal<typeof import('../server/services/exchangeRates.js')>(),
  getExchangeSnapshot: async () => ({ rates: { EUR: 1 }, date: '2026-01-01', fetchedAt: 0 }),
  convertAmount: async (value: unknown) => value,
}));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-stored-boundary-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, deleteUser } = await import('../server/db.js');
const { default: exportRouter } = await import('../server/routes/export.js');
const { default: statsRouter } = await import('../server/routes/stats.js');
let server: Server;
let baseUrl: string;
let userId: number;
beforeAll(async () => {
  userId = createUser('boundary-fixture', 'unused').id;
  db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist, genres, styles, formats, labels, tracklist)
    VALUES (?, 101, 1001, 'Legacy record', 'Legacy artist', 'null', '{}', '42', '"label"', '{}')`).run(userId);
  const app = express();
  app.use(session({ secret: 'temporary-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.userId = userId; req.session.authEpoch = 0; req.locale = 'en';
    req.t = (key, vars) => translate('en', key, vars); next();
  });
  app.use('/export', exportRouter); app.use('/stats', statsRouter);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
    baseUrl = `http://127.0.0.1:${address.port}`; resolve();
  }); });
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  deleteUser(userId); db.close(); vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

it('exports a legacy release with non-array JSON columns without treating parsed JSON as a trusted array', async () => {
  const response = await fetch(`${baseUrl}/export`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Legacy record');
});

it('counts dashboard records even when a stored JSON list contains a different JSON shape', async () => {
  const response = await fetch(`${baseUrl}/stats`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ totals: { total_records: 1 }, genres: [], styles: [], labels: [], formats: [] });
});
