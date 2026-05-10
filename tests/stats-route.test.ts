// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

const getSettingForUser = vi.hoisted(() => vi.fn());
const getRadarForUser = vi.hoisted(() => vi.fn());
const parseJson = vi.hoisted(() => vi.fn());
const countMeaningfulNoteRows = vi.hoisted(() => vi.fn());
const convertAmount = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());

vi.mock('../server/db.js', () => ({
  default: {
    prepare,
  },
  getSettingForUser,
  getRadarForUser,
  parseJson,
}));

vi.mock('../server/services/notes.js', () => ({
  countMeaningfulNoteRows,
}));

vi.mock('../server/services/exchangeRates.js', async () => {
  const actual = await vi.importActual('../server/services/exchangeRates.js');
  return {
    ...actual,
    convertAmount,
  };
});

const { default: statsRouter } = await import('../server/routes/stats.js');

describe('stats route', () => {
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    getSettingForUser.mockReset();
    getRadarForUser.mockReset();
    parseJson.mockReset();
    countMeaningfulNoteRows.mockReset();
    convertAmount.mockReset();
    prepare.mockReset();

    getSettingForUser.mockReturnValue('EUR');
    parseJson.mockImplementation((_value, fallback) => fallback);
    countMeaningfulNoteRows.mockReturnValue(0);
    convertAmount.mockImplementation(async (value) => value);
    getRadarForUser.mockReturnValue({
      items: [
        {
          opportunity: {
            reasons: ['below_target'],
            default_visible: true,
            is_in_collection: false,
          },
        },
        {
          opportunity: {
            reasons: ['high_priority_available', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
        },
        {
          opportunity: {
            reasons: ['below_target', 'already_in_collection'],
            default_visible: false,
            is_in_collection: true,
          },
        },
        {
          opportunity: {
            reasons: [],
            default_visible: true,
            is_in_collection: false,
          },
        },
      ],
      summary: {
        total: 4,
        active: 3,
        hidden: 1,
        resolved: 0,
        missingFromSource: 0,
        priced: 2,
        pending: 1,
        failed: 0,
        unavailable: 1,
      },
    });

    prepare.mockImplementation((sql: string) => ({
      get: (...args: unknown[]) => {
        if (sql.includes('COUNT(*) AS count') && sql.includes('FROM releases')) {
          return { count: 0 };
        }
        if (sql.includes('SUM(estimated_value)')) {
          return { total: 0 };
        }
        if (sql.includes('FROM sync_log')) {
          return null;
        }

        throw new Error(`Unhandled get query in stats route test: ${sql} :: ${JSON.stringify(args)}`);
      },
      all: () => [],
    }));

    const app = express();
    app.use((req, _res, next) => {
      req.session = { userId: 7 };
      req.t = (key: string) => key;
      next();
    });
    app.use('/api/stats', statsRouter);

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

  it('returns compact user-scoped Radar counts for the dashboard summary', async () => {
    const response = await fetch(`${baseUrl}/api/stats`);

    expect(response.status).toBe(200);
    expect(getRadarForUser).toHaveBeenCalledWith(7);
    await expect(response.json()).resolves.toMatchObject({
      radar: {
        totalWanted: 4,
        activeOpportunities: 2,
        belowTarget: 1,
        alreadyOwned: 1,
      },
    });
  });
});
