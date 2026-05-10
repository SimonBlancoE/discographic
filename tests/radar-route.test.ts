// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import {
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
} from '../shared/contracts/radar.js';

const getRadarForUser = vi.hoisted(() => vi.fn());
const getSettingForUser = vi.hoisted(() => vi.fn());
const updateRadarReleaseForUser = vi.hoisted(() => vi.fn());
const getDiscogsClientForUser = vi.hoisted(() => vi.fn());
const getExchangeSnapshot = vi.hoisted(() => vi.fn());
const parseRadarWantlistWorkbook = vi.hoisted(() => vi.fn());
const buildRadarWantlistPreview = vi.hoisted(() => vi.fn());
const applyRadarWantlistImport = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({}));

vi.mock('../server/db.js', () => ({
  default: mockDb,
  getRadarForUser,
  getSettingForUser,
  updateRadarReleaseForUser,
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

vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getDiscogsClientForUser,
}));

const { default: radarRouter } = await import('../server/routes/radar.js');

function createSummary() {
  return {
    total: 1,
    active: 1,
    hidden: 0,
    resolved: 0,
    missingFromSource: 0,
    priced: 1,
    pending: 0,
    failed: 0,
    unavailable: 0,
  };
}

function createRadarSnapshot(targetPriceEur = 10.42) {
  return {
    items: [
      {
        id: 1,
        user_id: 1,
        release_id: 303,
        title: 'Editable Release',
        artist: 'Artist C',
        year: 1998,
        cover_url: null,
        date_added: '2026-05-10T00:00:00Z',
        local: {
          priority: RADAR_PRIORITY.HIGH,
          target_price_eur: targetPriceEur,
          minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
          note: 'Watch copy',
          hidden: true,
          resolved: false,
        },
        source: {
          origin: RADAR_SOURCE_ORIGIN.DISCOGS,
          status: RADAR_SOURCE_STATUS.ACTIVE,
          last_seen_at: '2026-05-10T00:00:00Z',
        },
        marketplace: {
          status: MARKETPLACE_STATUS.PRICED,
          estimated_price: 20,
          listing_status: 'For Sale',
          listing_price: 25,
          listing_currency: 'EUR',
          listing_price_eur: 25,
          last_checked_at: '2026-05-10T00:00:00Z',
        },
        timestamps: {
          created_at: '2026-05-10T00:00:00Z',
          updated_at: '2026-05-10T01:00:00Z',
        },
      },
    ],
    summary: createSummary(),
  };
}

describe('radar route', () => {
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    getSettingForUser.mockReset();
    getRadarForUser.mockReset();
    updateRadarReleaseForUser.mockReset();
    getDiscogsClientForUser.mockReset();
    getExchangeSnapshot.mockReset();
    parseRadarWantlistWorkbook.mockReset();
    buildRadarWantlistPreview.mockReset();
    applyRadarWantlistImport.mockReset();

    getSettingForUser.mockReturnValue('USD');
    getExchangeSnapshot.mockResolvedValue({
      fetchedAt: 0,
      date: '2026-05-10',
      rates: {
        EUR: 1,
        USD: 1.2,
      },
    });
    getRadarForUser.mockReturnValue(createRadarSnapshot());
    updateRadarReleaseForUser.mockReturnValue(true);
    parseRadarWantlistWorkbook.mockReturnValue([{}]);
    buildRadarWantlistPreview.mockReturnValue({
      previewId: null,
      summary: {
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
        { header: 'target_price', key: 'target_price', required: false },
      ],
      ignoredColumns: [],
      rows: [
        {
          row: 2,
          release_id: 303,
          artist: 'Editable Release',
          title: 'Artist C',
          year: 1998,
          notes: 'Watch copy',
          date_added: '2026-05-10',
          target_price: 12.5,
          minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
          priority: RADAR_PRIORITY.HIGH,
        },
      ],
      errors: [
        {
          row: 3,
          column: 'release_id',
          value: 'bad',
          reason: 'Release ID must be a positive integer.',
        },
      ],
    });
    applyRadarWantlistImport.mockReturnValue({
      totalRows: 1,
      imported: 1,
      skipped: 0,
      added: 0,
      updated: 1,
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: 1 };
      req.t = (key: string) => key;
      next();
    });
    app.use('/api/radar', radarRouter);

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

  it('updates a local Radar decision in display currency and returns a converted snapshot', async () => {
    getRadarForUser.mockReturnValue(createRadarSnapshot(10.42));

    const response = await fetch(`${baseUrl}/api/radar/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        local: {
          priority: RADAR_PRIORITY.HIGH,
          target_price: 12.5,
          minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
          note: 'Watch copy',
          hidden: true,
          resolved: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(updateRadarReleaseForUser).toHaveBeenCalledWith(1, 1, {
      priority: RADAR_PRIORITY.HIGH,
      targetPriceEur: 10.42,
      minimumCondition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
      note: 'Watch copy',
      hidden: true,
      resolved: false,
    });

    const payload = await response.json();

    expect(getDiscogsClientForUser).not.toHaveBeenCalled();
    expect(payload.items[0]?.marketplace).not.toHaveProperty('listing_status');
    expect(payload.items[0]?.marketplace).not.toHaveProperty('listing_price');
    expect(payload.items[0]?.marketplace).not.toHaveProperty('listing_currency');
    expect(payload.items[0]?.marketplace).not.toHaveProperty('listing_price_eur');

    expect(payload).toMatchObject({
      items: [
        {
          id: 1,
          local: {
            priority: RADAR_PRIORITY.HIGH,
            target_price: 12.5,
            target_price_eur: 10.42,
            minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
            note: 'Watch copy',
            hidden: true,
            resolved: false,
          },
          marketplace: {
            estimated_price: 24,
          },
          display_currency: 'USD',
        },
      ],
      summary: createSummary(),
    });
  });

  it('applies a validated wantlist preview using display-currency target prices and returns the refreshed Radar snapshot', async () => {
    const form = new FormData();
    form.append('file', new Blob(['release_id,target_price\n303,12.5\n']), 'wantlist.csv');

    const previewResponse = await fetch(`${baseUrl}/api/radar/wantlist/preview`, {
      method: 'POST',
      body: form,
    });

    expect(previewResponse.status).toBe(200);
    const previewPayload = await previewResponse.json();
    expect(previewPayload.previewId).toEqual(expect.any(String));

    const applyResponse = await fetch(`${baseUrl}/api/radar/wantlist/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ previewId: previewPayload.previewId }),
    });

    expect(applyResponse.status).toBe(200);
    expect(applyRadarWantlistImport).toHaveBeenCalledWith(
      mockDb,
      1,
      [
        expect.objectContaining({
          release_id: 303,
          target_price_eur: 10.42,
        }),
      ],
    );

    await expect(applyResponse.json()).resolves.toMatchObject({
      ok: true,
      result: {
        totalRows: 2,
        imported: 1,
        skipped: 1,
        added: 0,
        updated: 1,
      },
      radar: {
        items: [
          {
            id: 1,
            local: {
              target_price: 12.5,
              target_price_eur: 10.42,
            },
            display_currency: 'USD',
          },
        ],
      },
    });
  });
});
