import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_STATUS, type RadarSyncResult } from '../shared/contracts/radar.js';
import { resetRadarRuntimeState } from '../server/services/radarRuntimeState.js';

const fetchMarketplaceValue = vi.hoisted(() => vi.fn());
const getPendingRadarEnrichmentCount = vi.hoisted(() => vi.fn());
const getPendingRadarEnrichmentRows = vi.hoisted(() => vi.fn());
const getRadarAvailabilityTransition = vi.hoisted(() => vi.fn());
const syncRadarWantlist = vi.hoisted(() => vi.fn());

vi.mock('../server/services/marketplaceValue.js', () => ({
  fetchMarketplaceValue,
}));

vi.mock('../server/services/radarEnrichmentQueue.js', () => ({
  getPendingRadarEnrichmentCount,
  getPendingRadarEnrichmentRows,
}));

vi.mock('../server/services/radarStorage.js', () => ({
  getRadarAvailabilityTransition,
}));

vi.mock('../server/services/radarWantlist.js', () => ({
  syncRadarWantlist,
}));

const { getRadarUpdateRunStatus, startRadarUpdateRun, stopRadarUpdateRun } = await import('../server/services/radarUpdateRun.js');

type FakeRadarRow = {
  id: number;
  release_id: number;
  marketplace_status: string;
  estimated_price: number | null;
};

type MarketplaceCheck = {
  estimatedValue: number | null;
  marketplaceStatus: string;
  error: string | null;
};

type FakeDiscogsClient = {
  getAllWantlist: () => Promise<unknown[]>;
  getMarketplaceStats: (releaseId: number, currency: string) => Promise<null>;
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for Radar update run');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createWantlistResult(overrides: Partial<RadarSyncResult> = {}): RadarSyncResult {
  return {
    totalFetched: 0,
    added: 0,
    updated: 0,
    reactivated: 0,
    markedMissing: 0,
    ignored: 0,
    ...overrides,
  };
}

function createDiscogsClient(wantlistRows: unknown[] = []): FakeDiscogsClient {
  return {
    getAllWantlist: async () => wantlistRows,
    getMarketplaceStats: async () => null,
  };
}

function createPendingRadarRow(id: number, releaseId: number): FakeRadarRow {
  return {
    id,
    release_id: releaseId,
    marketplace_status: MARKETPLACE_STATUS.PENDING,
    estimated_price: null,
  };
}

describe('Radar update run', () => {
  let rows: FakeRadarRow[];
  let db: {
    prepare: ReturnType<typeof vi.fn>;
  };

  function getStatus() {
    return getRadarUpdateRunStatus(db as never, 7, 'en');
  }

  function startUpdateRun(discogs: FakeDiscogsClient): boolean {
    return startRadarUpdateRun({
      db: db as never,
      userId: 7,
      locale: 'en',
      discogs,
    });
  }

  beforeEach(() => {
    rows = [];

    fetchMarketplaceValue.mockReset();
    getPendingRadarEnrichmentCount.mockReset();
    getPendingRadarEnrichmentRows.mockReset();
    getRadarAvailabilityTransition.mockReset();
    syncRadarWantlist.mockReset();

    getRadarAvailabilityTransition.mockReturnValue({
      markUnavailableNow: false,
      markAvailableAgainNow: false,
      clearAvailableAgain: false,
    });

    getPendingRadarEnrichmentRows.mockImplementation(() => (
      rows.filter((row) => (
        row.marketplace_status === MARKETPLACE_STATUS.PENDING
        || row.marketplace_status === MARKETPLACE_STATUS.FAILED
      ))
    ));

    getPendingRadarEnrichmentCount.mockImplementation(() => (
      rows.filter((row) => (
        row.marketplace_status === MARKETPLACE_STATUS.PENDING
        || row.marketplace_status === MARKETPLACE_STATUS.FAILED
      )).length
    ));

    db = {
      prepare: vi.fn(() => ({
        run: (
          estimatedPrice: number | null,
          marketplaceStatus: string,
          _markUnavailableNow: number,
          _markAvailableAgainNow: number,
          _clearAvailableAgain: number,
          radarRowId: number,
        ) => {
          const row = rows.find((candidate) => candidate.id === radarRowId);

          if (row) {
            row.estimated_price = estimatedPrice;
            row.marketplace_status = marketplaceStatus;
          }

          return { changes: row ? 1 : 0 };
        },
      })),
    };
  });

  afterEach(() => {
    resetRadarRuntimeState(7);
  });

  it('syncs Wantlist data and completes with issues when some Radar prices stay retryable', async () => {
    const wantlistRows = [
      { id: 111, basic_information: { id: 111, title: 'Wanted A', year: 2001, artists: [{ name: 'Artist A' }] } },
      { id: 222, basic_information: { id: 222, title: 'Wanted B', year: 2002, artists: [{ name: 'Artist B' }] } },
    ];
    const discogs = createDiscogsClient(wantlistRows);

    syncRadarWantlist.mockImplementation((_db, _userId, syncedRows) => {
      expect(syncedRows).toEqual(wantlistRows);
      rows = [
        createPendingRadarRow(1, 111),
        createPendingRadarRow(2, 222),
      ];

      return createWantlistResult({
        totalFetched: 2,
        added: 2,
      });
    });

    fetchMarketplaceValue
      .mockResolvedValueOnce({
        estimatedValue: 19,
        marketplaceStatus: MARKETPLACE_STATUS.PRICED,
        error: null,
      })
      .mockResolvedValueOnce({
        estimatedValue: null,
        marketplaceStatus: MARKETPLACE_STATUS.FAILED,
        error: 'temporary',
      });

    expect(startUpdateRun(discogs)).toBe(true);

    await waitFor(() => getStatus().isTerminal);

    expect(getStatus()).toMatchObject({
      phase: 'completed_with_issues',
      current: 2,
      total: 2,
      pending: 1,
      progressPercent: 100,
      wantlist: {
        totalFetched: 2,
        added: 2,
        updated: 0,
        reactivated: 0,
        markedMissing: 0,
        ignored: 0,
      },
      isRunning: false,
      isTerminal: true,
      canStop: false,
    });
    expect(rows).toEqual([
      { id: 1, release_id: 111, marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_price: 19 },
      { id: 2, release_id: 222, marketplace_status: MARKETPLACE_STATUS.FAILED, estimated_price: null },
    ]);
  });

  it('reports active-run conflicts and exposes reviewing progress before completion', async () => {
    const firstMarketplaceCheck = createDeferred<MarketplaceCheck>();
    const discogs = createDiscogsClient([
      { id: 111, basic_information: { id: 111, title: 'Wanted A', year: 2001, artists: [{ name: 'Artist A' }] } },
    ]);

    syncRadarWantlist.mockImplementation(() => {
      rows = [
        createPendingRadarRow(1, 111),
      ];

      return createWantlistResult({
        totalFetched: 1,
        added: 1,
      });
    });

    fetchMarketplaceValue.mockReturnValueOnce(firstMarketplaceCheck.promise);

    expect(startUpdateRun(discogs)).toBe(true);

    await waitFor(() => getStatus().phase === 'reviewing_prices');

    expect(startUpdateRun(discogs)).toBe(false);
    expect(getStatus()).toMatchObject({
      phase: 'reviewing_prices',
      current: 0,
      total: 1,
      pending: 1,
      progressPercent: 0,
      isRunning: true,
      canStop: true,
    });

    firstMarketplaceCheck.resolve({
      estimatedValue: 21,
      marketplaceStatus: MARKETPLACE_STATUS.PRICED,
      error: null,
    });

    await waitFor(() => getStatus().phase === 'completed');

    expect(getStatus()).toMatchObject({
      phase: 'completed',
      current: 1,
      total: 1,
      pending: 0,
      progressPercent: 100,
      isRunning: false,
      isTerminal: true,
    });
  });

  it('stops a long-running price review without pretending the remaining work completed', async () => {
    const firstMarketplaceCheck = createDeferred<MarketplaceCheck>();
    const discogs = createDiscogsClient([
      { id: 111, basic_information: { id: 111, title: 'Wanted A', year: 2001, artists: [{ name: 'Artist A' }] } },
      { id: 222, basic_information: { id: 222, title: 'Wanted B', year: 2002, artists: [{ name: 'Artist B' }] } },
    ]);

    syncRadarWantlist.mockImplementation(() => {
      rows = [
        createPendingRadarRow(1, 111),
        createPendingRadarRow(2, 222),
      ];

      return createWantlistResult({
        totalFetched: 2,
        added: 2,
      });
    });

    fetchMarketplaceValue
      .mockReturnValueOnce(firstMarketplaceCheck.promise)
      .mockResolvedValueOnce({
        estimatedValue: 25,
        marketplaceStatus: MARKETPLACE_STATUS.PRICED,
        error: null,
      });

    expect(startUpdateRun(discogs)).toBe(true);

    await waitFor(() => getStatus().phase === 'reviewing_prices');

    stopRadarUpdateRun(db as never, 7, 'en');
    firstMarketplaceCheck.resolve({
      estimatedValue: 17,
      marketplaceStatus: MARKETPLACE_STATUS.PRICED,
      error: null,
    });

    await waitFor(() => {
      const status = getStatus();
      return status.phase === 'stopped' && status.current === 1 && status.pending === 1;
    });

    expect(getStatus()).toMatchObject({
      phase: 'stopped',
      current: 1,
      total: 2,
      pending: 1,
      progressPercent: 50,
      isRunning: false,
      isTerminal: true,
      canStop: false,
    });
    expect(rows).toEqual([
      { id: 1, release_id: 111, marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_price: 17 },
      { id: 2, release_id: 222, marketplace_status: MARKETPLACE_STATUS.PENDING, estimated_price: null },
    ]);
  });
});
