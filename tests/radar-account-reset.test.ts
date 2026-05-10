// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const getRadarForUser = vi.hoisted(() => vi.fn());
const getSettingForUser = vi.hoisted(() => vi.fn());
const updateRadarReleaseForUser = vi.hoisted(() => vi.fn());
const getDiscogsAccount = vi.hoisted(() => vi.fn());
const upsertDiscogsAccount = vi.hoisted(() => vi.fn());
const clearUserCollectionData = vi.hoisted(() => vi.fn());
const setSettingForUser = vi.hoisted(() => vi.fn());
const getDiscogsClientForUser = vi.hoisted(() => vi.fn());
const getExchangeSnapshot = vi.hoisted(() => vi.fn());
const parseRadarWantlistWorkbook = vi.hoisted(() => vi.fn());
const buildRadarWantlistPreview = vi.hoisted(() => vi.fn());
const applyRadarWantlistImport = vi.hoisted(() => vi.fn());
const getPendingRadarEnrichmentCount = vi.hoisted(() => vi.fn());
const getPendingRadarEnrichmentRows = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({}));

vi.mock('../server/db.js', () => ({
  default: mockDb,
  getRadarForUser,
  getSettingForUser,
  updateRadarReleaseForUser,
  getDiscogsAccount,
  upsertDiscogsAccount,
  clearUserCollectionData,
  setSettingForUser,
}));

vi.mock('../server/services/exchangeRates.js', async () => {
  const actual = await vi.importActual('../server/services/exchangeRates.js');
  return {
    ...actual,
    getExchangeSnapshot,
  };
});

vi.mock('../server/services/radarWantlistImport.js', () => ({
  parseRadarWantlistWorkbook,
  buildRadarWantlistPreview,
  applyRadarWantlistImport,
}));

vi.mock('../server/services/radarEnrichmentQueue.js', () => ({
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
}));

vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getDiscogsClientForUser,
}));

const { default: radarRouter } = await import('../server/routes/radar.js');
const { default: accountRouter } = await import('../server/routes/account.js');
const {
  clearRadarEnrichmentRunning,
  markRadarEnrichmentRunning,
  resetRadarRuntimeState,
  setRadarEnrichmentState,
} = await import('../server/services/radarRuntimeState.js');

describe('Radar account reset workflow', () => {
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    getRadarForUser.mockReset();
    getSettingForUser.mockReset();
    updateRadarReleaseForUser.mockReset();
    getDiscogsAccount.mockReset();
    upsertDiscogsAccount.mockReset();
    clearUserCollectionData.mockReset();
    setSettingForUser.mockReset();
    getDiscogsClientForUser.mockReset();
    getExchangeSnapshot.mockReset();
    parseRadarWantlistWorkbook.mockReset();
    buildRadarWantlistPreview.mockReset();
    applyRadarWantlistImport.mockReset();
    getPendingRadarEnrichmentCount.mockReset();
    getPendingRadarEnrichmentRows.mockReset();

    getSettingForUser.mockReturnValue('EUR');
    getDiscogsAccount.mockReturnValue({
      user_id: 1,
      discogs_username: 'collector',
      discogs_token: 'secret-token',
    });
    upsertDiscogsAccount.mockReturnValue({
      user_id: 1,
      discogs_username: 'collector',
      discogs_token: 'secret-token',
    });
    getExchangeSnapshot.mockResolvedValue({
      fetchedAt: 0,
      date: '2026-05-10',
      rates: { EUR: 1 },
    });
    parseRadarWantlistWorkbook.mockReturnValue([{}]);
    buildRadarWantlistPreview.mockReturnValue({
      previewId: null,
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
      ],
      ignoredColumns: [],
      rows: [
        {
          row: 2,
          release_id: 303,
          artist: 'Artist C',
          title: 'Editable Release',
          year: 1998,
          notes: 'Watch copy',
          date_added: '2026-05-10',
          target_price: 12.5,
          minimum_condition: null,
          priority: 'high',
        },
      ],
      errors: [],
    });
    getPendingRadarEnrichmentCount.mockReturnValue(0);
    getPendingRadarEnrichmentRows.mockReturnValue([]);
    resetRadarRuntimeState(1);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: 1 };
      req.t = (key: string) => key;
      next();
    });
    app.use('/api/radar', radarRouter);
    app.use('/api/account', accountRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Failed to bind test server');
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('invalidates cached Radar Wantlist previews when local data is reset', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['release_id\n303\n'], { type: 'text/csv' }),
      'wantlist.csv',
    );

    const previewResponse = await fetch(`${baseUrl}/api/radar/wantlist/preview`, {
      method: 'POST',
      body: form,
    });
    const previewPayload = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(typeof previewPayload.previewId).toBe('string');

    const resetResponse = await fetch(`${baseUrl}/api/account/reset`, {
      method: 'POST',
    });

    expect(resetResponse.status).toBe(200);

    const applyResponse = await fetch(`${baseUrl}/api/radar/wantlist/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        previewId: previewPayload.previewId,
      }),
    });

    expect(applyResponse.status).toBe(410);
    await expect(applyResponse.json()).resolves.toEqual({
      error: 'backend.radarImport.previewExpired',
    });
  });

  it('resets stale Radar enrichment status when the Discogs account changes', async () => {
    markRadarEnrichmentRunning(1);
    setRadarEnrichmentState(1, {
      status: 'running',
      current: 1,
      total: 3,
      pending: 2,
      message: 'Enriching Radar 1/3...',
      startedAt: '2026-05-10T00:00:00Z',
      finishedAt: null,
    });

    const beforeResponse = await fetch(`${baseUrl}/api/radar/status`);
    expect(beforeResponse.status).toBe(200);
    await expect(beforeResponse.json()).resolves.toMatchObject({
      status: 'running',
      isRunning: true,
      current: 1,
      total: 3,
    });

    upsertDiscogsAccount.mockReturnValue({
      user_id: 1,
      discogs_username: 'new-collector',
      discogs_token: 'new-secret-token',
    });

    const updateResponse = await fetch(`${baseUrl}/api/account`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discogsUsername: 'new-collector',
        discogsToken: 'new-secret-token',
      }),
    });

    expect(updateResponse.status).toBe(200);

    const afterResponse = await fetch(`${baseUrl}/api/radar/status`);
    expect(afterResponse.status).toBe(200);
    await expect(afterResponse.json()).resolves.toMatchObject({
      status: 'idle',
      isRunning: false,
      current: 0,
      total: 0,
      pending: 0,
    });

    clearRadarEnrichmentRunning(1);
  });
});
