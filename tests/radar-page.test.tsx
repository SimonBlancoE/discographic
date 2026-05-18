/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Radar from '../src/pages/Radar';
import { formatCurrency, formatDate } from '../src/lib/format.js';
import type { RadarRelease, RadarResponse } from '../shared/contracts/radar.js';

const authState = vi.hoisted(() => ({
  accountUnavailable: false,
  capabilities: {
    canUseRadar: false,
  },
}));

const getRadar = vi.hoisted(() => vi.fn());
const previewRadarWantlist = vi.hoisted(() => vi.fn());
const applyRadarWantlistPreview = vi.hoisted(() => vi.fn());
const downloadRadarWantlistTemplate = vi.hoisted(() => vi.fn());
const updateRadarRelease = vi.hoisted(() => vi.fn());
const getRadarStatus = vi.hoisted(() => vi.fn());
const startRadarUpdateRun = vi.hoisted(() => vi.fn());
const stopRadarUpdateRun = vi.hoisted(() => vi.fn());

const messages = {
  'radar.eyebrow': 'Radar',
  'radar.blockedTitle': 'Connect your Discogs account',
  'radar.blockedBody': 'Radar needs a configured Discogs account before it can show your buying workspace.',
  'radar.openSettings': 'Open Settings',
  'radar.updateAction': 'Update Radar',
  'radar.importAction': 'Import file',
  'radar.updating': 'Updating Radar...',
  'radar.updateError': 'Radar could not start updating: boom',
  'radar.updateStatusError': 'Radar update status could not be loaded. Try again in a moment.',
  'radar.syncResultTitle': 'Wantlist synced',
  'radar.syncResultSummary': 'Checked 1 wanted release from Discogs.',
  'radar.syncBreakdown': '1 new · 0 updated · 0 back again · 0 missing now',
  'radar.loading': 'Loading your Radar workspace...',
  'radar.loadFailed': 'Radar could not be loaded. Try again in a moment.',
  'radar.summary.total': 'Wanted',
  'radar.summary.active': 'Active',
  'radar.summary.hidden': 'Hidden',
  'radar.summary.resolved': 'Resolved',
  'radar.summary.missingFromSource': 'Missing',
  'radar.summary.priced': 'Priced',
  'radar.summary.pending': 'Pending',
  'radar.summary.failed': 'Failed',
  'radar.summary.unavailable': 'Unavailable',
  'radar.filtersTitle': 'Filters',
  'radar.filter.all': 'Active wanted releases',
  'radar.filter.opportunities': 'Active opportunities',
  'radar.filter.belowTarget': 'Below target',
  'radar.filter.highPriority': 'High priority',
  'radar.filter.inCollection': 'Already in collection',
  'radar.filter.attention': 'Pending / incidents',
  'radar.filter.hiddenResolved': 'Hidden or resolved',
  'radar.filter.missingFromSource': 'Missing from source',
  'radar.filter.pending': 'Pending update',
  'radar.filter.failed': 'Update errors',
  'radar.filterEmptyTitle': 'No releases match this filter',
  'radar.filterEmptyBody': 'Try another Radar filter to inspect a different slice of your wanted releases.',
  'radar.updateTitle': 'Radar update run',
  'radar.updateBody': 'Refresh Wantlist data first, then check any prices that still need review as one clear workflow.',
  'radar.updatePhase.idle': 'Ready',
  'radar.updatePhase.syncing': 'Updating Wantlist',
  'radar.updatePhase.reviewing_prices': 'Reviewing prices',
  'radar.updatePhase.completed': 'Completed',
  'radar.updatePhase.completed_with_issues': 'Completed with issues',
  'radar.updatePhase.failed': 'Failed',
  'radar.updatePhase.stopped': 'Stopped',
  'radar.updateStop': 'Stop',
  'radar.updateStatus': 'Status',
  'radar.updateCurrent': 'Current',
  'radar.updateTotal': 'Total',
  'radar.updatePending': 'Pending',
  'radar.emptyTitle': 'Your Radar is ready',
  'radar.emptyBody': 'Your list is empty for now. When Wantlist releases arrive, Radar will keep their local decisions and market state here.',
  'radar.gettingStartedTitle': 'Start with your Wantlist',
  'radar.gettingStartedBody': 'Use Update Radar to pull your Discogs Wantlist and check prices in one run. If Discogs is not available, import a CSV or XLSX fallback instead.',
  'radar.accountUnavailable': 'Discogs account status could not be loaded. Reload the page or review Settings before opening Radar.',
  'radar.import.title': 'Wantlist fallback import',
  'radar.import.description': 'Use a CSV or XLSX file as a manual fallback or supplemental Wantlist source before you run a full Radar update.',
  'radar.import.requiredHint': 'Required: release_id. Optional: artist, title, year, notes, date added, target price, minimum condition, priority.',
  'radar.import.upload': 'Upload CSV/XLSX',
  'radar.import.downloadCsvTemplate': 'CSV template',
  'radar.import.downloadXlsxTemplate': 'XLSX template',
  'radar.import.loading': 'Analyzing Wantlist file...',
  'radar.import.previewTitle': 'Wantlist preview',
  'radar.import.totalRows': '2 rows',
  'radar.import.validRows': '1 valid',
  'radar.import.invalidRows': '1 invalid',
  'radar.import.mappedColumns': 'Mapped columns',
  'radar.import.ignoredColumns': 'Ignored columns',
  'radar.import.previewRows': 'Preview rows',
  'radar.import.rowError': 'Row 3, column Prioridad: \"urgent\" - Priority must be low, normal, or high.',
  'radar.import.apply': 'Import valid rows',
  'radar.import.applying': 'Importing preview...',
  'radar.import.applySummary': 'Imported 1 valid rows. Skipped 1 invalid rows.',
  'radar.import.applyBreakdown': '1 new · 0 merged',
  'radar.import.applyNextStep': 'Radar was updated locally. Review the imported releases below, then use Update Radar when you want to refresh Wantlist data and prices from Discogs.',
  'radar.import.applyFailed': 'Radar could not import this preview: boom',
  'radar.openDiscogs': 'Open on Discogs',
  'radar.priority': 'Priority',
  'radar.priority.low': 'Low',
  'radar.priority.normal': 'Normal',
  'radar.priority.high': 'High',
  'radar.currentPrice': 'Current price',
  'radar.targetPrice': 'Target price',
  'radar.wantlistDate': 'Wantlist date',
  'radar.lastPriceReview': 'Last price review',
  'radar.state.pending': 'Pending update',
  'radar.state.unavailable': 'No price available',
  'radar.state.failed': 'Update failed',
  'radar.state.hidden': 'Hidden',
  'radar.state.resolved': 'Resolved',
  'radar.state.missingFromSource': 'Missing from source',
  'radar.minimumCondition': 'Minimum condition',
  'radar.minimumCondition.info': 'Saved for future listing filters. Informational only in Radar v1.',
  'radar.minimumCondition.none': 'No preference',
  'radar.minimumCondition.M': 'Mint (M)',
  'radar.minimumCondition.NM': 'Near Mint (NM)',
  'radar.minimumCondition.VG+': 'Very Good Plus (VG+)',
  'radar.minimumCondition.VG': 'Very Good (VG)',
  'radar.minimumCondition.G+': 'Good Plus (G+)',
  'radar.minimumCondition.G': 'Good (G)',
  'radar.minimumCondition.F': 'Fair (F)',
  'radar.minimumCondition.P': 'Poor (P)',
  'radar.opportunity.below_target': 'Below target price',
  'radar.opportunity.high_priority_available': 'High priority with copy available',
  'radar.opportunity.available_again': 'Available again',
  'radar.opportunity.already_in_collection': 'Already in your collection',
  'radar.collectionMatch.single': 'View {count} copy in your collection',
  'radar.collectionMatch.multiple': 'View {count} copies in your collection',
  'radar.note': 'Note',
  'radar.hidden': 'Hidden',
  'radar.resolved': 'Resolved',
  'radar.save': 'Save local decision',
  'radar.saving': 'Saving...',
  'radar.saveFailed': 'Radar could not save your local decision. Try again.',
} satisfies Record<string, string>;

function translate(key: string, values?: Record<string, string | number>) {
  const template = messages[key as keyof typeof messages] ?? key;
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

const RADAR_TEST_TIMESTAMP = '2026-05-10T00:00:00Z';

type RadarReleaseFixture = Pick<RadarRelease, 'id' | 'release_id' | 'title' | 'artist'> & {
  user_id?: RadarRelease['user_id'];
  year?: RadarRelease['year'];
  cover_url?: RadarRelease['cover_url'];
  date_added?: RadarRelease['date_added'];
  local?: Partial<RadarRelease['local']>;
  source?: Partial<RadarRelease['source']>;
  marketplace?: Partial<RadarRelease['marketplace']>;
  timestamps?: Partial<RadarRelease['timestamps']>;
  opportunity?: Partial<RadarRelease['opportunity']>;
  display_currency?: RadarRelease['display_currency'];
};

function createRadarRelease(overrides: RadarReleaseFixture): RadarRelease {
  const local = {
    priority: 'normal',
    target_price: null,
    target_price_eur: null,
    minimum_condition: null,
    note: '',
    hidden: false,
    resolved: false,
    ...overrides.local,
  } satisfies RadarRelease['local'];
  const source = {
    origin: 'discogs',
    status: 'active',
    last_seen_at: RADAR_TEST_TIMESTAMP,
    ...overrides.source,
  } satisfies RadarRelease['source'];

  return {
    id: overrides.id,
    user_id: overrides.user_id ?? 1,
    release_id: overrides.release_id,
    title: overrides.title,
    artist: overrides.artist,
    year: overrides.year ?? null,
    cover_url: overrides.cover_url ?? null,
    date_added: overrides.date_added ?? RADAR_TEST_TIMESTAMP,
    local,
    source,
    marketplace: {
      status: 'pending',
      estimated_price: null,
      last_checked_at: null,
      ...overrides.marketplace,
    },
    timestamps: {
      created_at: RADAR_TEST_TIMESTAMP,
      updated_at: RADAR_TEST_TIMESTAMP,
      ...overrides.timestamps,
    },
    opportunity: {
      reasons: [],
      default_visible: !local.hidden && !local.resolved && source.status !== 'missing',
      is_in_collection: false,
      collection_match: null,
      ...overrides.opportunity,
    },
    display_currency: overrides.display_currency ?? 'EUR',
  };
}

function createRadarResponse(
  items: RadarRelease[] = [],
  summary: Partial<RadarResponse['summary']> = {},
): RadarResponse {
  return {
    items,
    summary: {
      total: items.length,
      active: items.length,
      hidden: 0,
      resolved: 0,
      missingFromSource: 0,
      priced: 0,
      pending: 0,
      failed: 0,
      unavailable: 0,
      ...summary,
    },
  };
}

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: translate,
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getRadar,
    previewRadarWantlist,
    applyRadarWantlistPreview,
    downloadRadarWantlistTemplate,
    updateRadarRelease,
    getRadarStatus,
    startRadarUpdateRun,
    stopRadarUpdateRun,
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderRadar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <Radar />
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
}

async function clickRadarFilter(rendered: HTMLDivElement, filter: string) {
  const button = rendered.querySelector(`button[data-radar-filter="${filter}"]`) as HTMLButtonElement | null;

  if (!button) {
    throw new Error(`Missing Radar filter button: ${filter}`);
  }

  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

function findButtonByText(rendered: HTMLDivElement, text: string): HTMLButtonElement | null {
  return Array.from(rendered.querySelectorAll('button')).find((button) => button.textContent === text) ?? null;
}

function findHeadingByText(rendered: HTMLDivElement, text: string): HTMLHeadingElement | null {
  return Array.from(rendered.querySelectorAll('h2')).find((heading) => heading.textContent === text) ?? null;
}

async function uploadWantlistCsv(rendered: HTMLDivElement) {
  const uploadInput = rendered.querySelector('input[type="file"]') as HTMLInputElement | null;

  if (!uploadInput) {
    throw new Error('Missing Radar Wantlist upload input');
  }

  const file = new File(['release_id\n12345\n'], 'wantlist.csv', { type: 'text/csv' });
  Object.defineProperty(uploadInput, 'files', {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Radar page', () => {
  beforeEach(() => {
    authState.accountUnavailable = false;
    authState.capabilities.canUseRadar = false;
    getRadar.mockReset();
    previewRadarWantlist.mockReset();
    applyRadarWantlistPreview.mockReset();
    downloadRadarWantlistTemplate.mockReset();
    updateRadarRelease.mockReset();
    getRadarStatus.mockReset();
    startRadarUpdateRun.mockReset();
    stopRadarUpdateRun.mockReset();
    getRadar.mockResolvedValue(createRadarResponse());
    getRadarStatus.mockResolvedValue({
      phase: 'idle',
      current: 0,
      total: 0,
      pending: 2,
      progressPercent: 0,
      message: 'Radar is ready to update your Wantlist and review prices.',
      startedAt: null,
      finishedAt: null,
      wantlist: {
        totalFetched: 0,
        added: 0,
        updated: 0,
        reactivated: 0,
        markedMissing: 0,
        ignored: 0,
      },
      isRunning: false,
      isTerminal: false,
      canStop: false,
    });
    startRadarUpdateRun.mockResolvedValue({
      phase: 'completed',
      current: 1,
      total: 1,
      pending: 0,
      progressPercent: 100,
      message: 'Radar update completed.',
      startedAt: '2026-05-10T12:00:00Z',
      finishedAt: '2026-05-10T12:01:00Z',
      wantlist: {
        totalFetched: 1,
        added: 1,
        updated: 0,
        reactivated: 0,
        markedMissing: 0,
        ignored: 0,
      },
      isRunning: false,
      isTerminal: true,
      canStop: false,
    });
    previewRadarWantlist.mockResolvedValue({
      previewId: 'preview-1',
      summary: {
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
        { header: 'Prioridad', key: 'priority', required: false },
      ],
      ignoredColumns: ['Color'],
      rows: [
        {
          row: 2,
          release_id: 12345,
          artist: 'Kraftwerk',
          title: 'Computer World',
          year: 1981,
          notes: 'Need clean copy',
          date_added: '2026-05-10',
          target_price: 18,
          minimum_condition: 'VG+',
          priority: 'high',
        },
      ],
      errors: [
        {
          row: 3,
          column: 'Prioridad',
          value: 'urgent',
          reason: 'Priority must be low, normal, or high.',
        },
      ],
    });
    applyRadarWantlistPreview.mockResolvedValue({
      ok: true,
      radar: {
        items: [
          {
            id: 8,
            user_id: 1,
            release_id: 12345,
            title: 'Computer World',
            artist: 'Kraftwerk',
            year: 1981,
            cover_url: null,
            date_added: '2026-05-10',
            local: {
              priority: 'high',
              target_price: 18,
              target_price_eur: 18,
              minimum_condition: 'VG+',
              note: 'Need clean copy',
              hidden: false,
              resolved: false,
            },
            source: {
              origin: 'file',
              status: 'active',
              last_seen_at: '2026-05-10T12:00:00Z',
            },
            marketplace: {
              status: 'pending',
              estimated_price: null,
              last_checked_at: null,
            },
            timestamps: {
              created_at: '2026-05-10T12:00:00Z',
              updated_at: '2026-05-10T12:00:00Z',
            },
            opportunity: {
              reasons: [],
              default_visible: true,
              is_in_collection: false,
            },
            display_currency: 'EUR',
          },
        ],
        summary: {
          total: 1,
          active: 1,
          hidden: 0,
          resolved: 0,
          missingFromSource: 0,
          priced: 0,
          pending: 1,
          failed: 0,
          unavailable: 0,
        },
      },
      result: {
        totalRows: 2,
        imported: 1,
        skipped: 1,
        added: 1,
        updated: 0,
      },
    });
    stopRadarUpdateRun.mockResolvedValue({
      phase: 'stopped',
      current: 1,
      total: 4,
      pending: 3,
      progressPercent: 25,
      message: 'Radar stopped after reviewing 1 releases. 3 still need price review.',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      wantlist: {
        totalFetched: 4,
        added: 2,
        updated: 1,
        reactivated: 0,
        markedMissing: 1,
        ignored: 0,
      },
      isRunning: false,
      isTerminal: true,
      canStop: false,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('shows a blocked state with a Settings link when the Discogs account is not configured', async () => {
    const html = (await renderRadar()).innerHTML;

    expect(html).toContain(messages['radar.eyebrow']);
    expect(html).toContain(messages['radar.blockedTitle']);
    expect(html).toContain(messages['radar.blockedBody']);
    expect(html).toContain('href="/settings"');
    expect(html).toContain(messages['radar.openSettings']);
    expect(getRadar).not.toHaveBeenCalled();
    expect(getRadarStatus).not.toHaveBeenCalled();
  });

  it('fetches and shows an empty Radar workspace summary when the Discogs account is configured', async () => {
    authState.capabilities.canUseRadar = true;

    const rendered = await renderRadar();
    const text = rendered.textContent ?? '';

    expect(getRadar).toHaveBeenCalledTimes(1);
    expect(getRadarStatus).toHaveBeenCalledTimes(1);
    expect(text).toContain(messages['radar.eyebrow']);
    expect(text).toContain(messages['radar.summary.active']);
    expect(text).toContain(messages['radar.summary.pending']);
    expect(text).toContain(messages['radar.updateTitle']);
    expect(text).toContain(messages['radar.updateAction']);
    expect(text).toContain(messages['radar.updatePending']);
    expect(text).toContain(messages['radar.import.title']);
    expect(text).toContain(messages['radar.emptyTitle']);
    expect(text).toContain(messages['radar.emptyBody']);
  });

  it('shows plain-language getting-started guidance for a fresh Radar workspace', async () => {
    authState.capabilities.canUseRadar = true;

    const rendered = await renderRadar();
    const gettingStarted = rendered.querySelector('[data-radar-getting-started="true"]');
    const text = gettingStarted?.textContent ?? '';

    expect(gettingStarted).not.toBeNull();
    expect(text).toContain(messages['radar.gettingStartedTitle']);
    expect(text).toContain(messages['radar.gettingStartedBody']);
  });

  it('runs a unified Radar update and shows the refreshed Wantlist result with the latest Radar list', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValueOnce(createRadarResponse()).mockResolvedValueOnce(
      createRadarResponse(
        [
          createRadarRelease({
            id: 1,
            release_id: 901,
            title: 'Fresh Want',
            artist: 'New Artist',
            year: 2024,
            opportunity: {
              reasons: ['high_priority_available'],
              default_visible: true,
              is_in_collection: false,
            },
          }),
        ],
        { pending: 1 },
      ),
    );

    const rendered = await renderRadar();
    const updateButton = Array.from(rendered.querySelectorAll('button')).find(
      (button) => button.textContent === messages['radar.updateAction'],
    );

    expect(updateButton).toBeTruthy();

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = rendered.textContent ?? '';

    expect(startRadarUpdateRun).toHaveBeenCalledTimes(1);
    expect(text).toContain(messages['radar.syncResultTitle']);
    expect(text).toContain(messages['radar.syncResultSummary']);
    expect(text).toContain(messages['radar.syncBreakdown']);
    expect(text).toContain('Fresh Want');
    expect(text).toContain('New Artist');
  });

  it('keeps releases removed from Discogs out of the refreshed active Radar list', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValueOnce(createRadarResponse()).mockResolvedValueOnce(
      createRadarResponse(
        [
          createRadarRelease({
            id: 51,
            release_id: 951,
            title: 'Current Want',
            artist: 'Current Artist',
            opportunity: {
              default_visible: true,
            },
          }),
          createRadarRelease({
            id: 52,
            release_id: 952,
            title: 'Removed Want',
            artist: 'Removed Artist',
            source: {
              status: 'missing',
              last_seen_at: '2026-05-09T00:00:00Z',
            },
            marketplace: {
              status: 'unavailable',
              last_checked_at: RADAR_TEST_TIMESTAMP,
            },
          }),
        ],
        {
          total: 2,
          active: 1,
          missingFromSource: 1,
          pending: 1,
          unavailable: 1,
        },
      ),
    );

    const rendered = await renderRadar();
    const updateButton = findButtonByText(rendered, messages['radar.updateAction']);

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.textContent ?? '').toContain(messages['radar.syncResultTitle']);
    expect(rendered.textContent ?? '').toContain('Current Want');
    expect(rendered.textContent ?? '').not.toContain('Removed Want');

    await clickRadarFilter(rendered, 'missing_from_source');

    const missingText = rendered.textContent ?? '';

    expect(missingText).toContain('Removed Want');
    expect(missingText).toContain(messages['radar.state.missingFromSource']);
    expect(missingText).not.toContain('Current Want');
  });

  it('retries transient Radar update status failures while a run is active', async () => {
    vi.useFakeTimers();
    authState.capabilities.canUseRadar = true;

    getRadar
      .mockResolvedValueOnce(createRadarResponse())
      .mockResolvedValueOnce(
        createRadarResponse([
          createRadarRelease({
            id: 41,
            release_id: 941,
            title: 'Completed Want',
            artist: 'Recovered Artist',
          }),
        ]),
      );
    getRadarStatus
      .mockResolvedValueOnce({
        phase: 'reviewing_prices',
        current: 1,
        total: 2,
        pending: 1,
        progressPercent: 50,
        message: 'Reviewing Radar prices.',
        startedAt: '2026-05-10T12:00:00Z',
        finishedAt: null,
        wantlist: {
          totalFetched: 2,
          added: 1,
          updated: 1,
          reactivated: 0,
          markedMissing: 0,
          ignored: 0,
        },
        isRunning: true,
        isTerminal: false,
        canStop: true,
      })
      .mockRejectedValueOnce(new Error('temporary status failure'))
      .mockResolvedValueOnce({
        phase: 'completed',
        current: 2,
        total: 2,
        pending: 0,
        progressPercent: 100,
        message: 'Radar update completed.',
        startedAt: '2026-05-10T12:00:00Z',
        finishedAt: '2026-05-10T12:01:00Z',
        wantlist: {
          totalFetched: 2,
          added: 1,
          updated: 1,
          reactivated: 0,
          markedMissing: 0,
          ignored: 0,
        },
        isRunning: false,
        isTerminal: true,
        canStop: false,
      });

    try {
      const rendered = await renderRadar();

      expect(rendered.textContent ?? '').toContain(messages['radar.updating']);

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(rendered.textContent ?? '').toContain(messages['radar.updateStatusError']);

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      });

      const text = rendered.textContent ?? '';

      expect(getRadarStatus).toHaveBeenCalledTimes(3);
      expect(text).toContain(messages['radar.updateAction']);
      expect(text).toContain(messages['radar.updatePhase.completed']);
      expect(text).toContain('Completed Want');
      expect(text).toContain('Recovered Artist');
      expect(text).not.toContain(messages['radar.updateStatusError']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns to the full Radar list after a completed update finishes from a filtered view', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValueOnce(
      createRadarResponse(
        [
          createRadarRelease({
            id: 31,
            release_id: 931,
            title: 'Visible Opportunity',
            artist: 'Artist Visible',
            local: {
              priority: 'high',
            },
            marketplace: {
              status: 'priced',
              estimated_price: 18,
              last_checked_at: RADAR_TEST_TIMESTAMP,
            },
            opportunity: {
              reasons: ['high_priority_available'],
              default_visible: true,
              is_in_collection: false,
            },
          }),
        ],
        { priced: 1 },
      ),
    ).mockResolvedValueOnce(
      createRadarResponse(
        [
          createRadarRelease({
            id: 32,
            release_id: 932,
            title: 'Fresh Pending Want',
            artist: 'Artist Pending',
            opportunity: {
              reasons: [],
              default_visible: true,
              is_in_collection: false,
            },
          }),
        ],
        { pending: 1 },
      ),
    );

    const rendered = await renderRadar();

    await clickRadarFilter(rendered, 'opportunities');
    expect(rendered.textContent ?? '').toContain('Visible Opportunity');
    expect(rendered.textContent ?? '').not.toContain('Fresh Pending Want');

    const updateButton = findButtonByText(rendered, messages['radar.updateAction']);

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = rendered.textContent ?? '';

    expect(text).toContain(messages['radar.syncResultTitle']);
    expect(text).toContain('Fresh Pending Want');
    expect(text).not.toContain(messages['radar.filterEmptyTitle']);
  });

  it('shows explicit opportunity reasons and keeps hidden or resolved rows out of the opportunities filter', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: 1,
          release_id: 401,
          title: 'Visible Opportunity',
          artist: 'Artist A',
          year: 1999,
          cover_url: null,
          date_added: '2026-05-10T00:00:00Z',
          local: {
            priority: 'high',
            target_price: 18,
            target_price_eur: 18,
            minimum_condition: null,
            note: '',
            hidden: false,
            resolved: false,
          },
          source: {
            origin: 'discogs',
            status: 'active',
            last_seen_at: '2026-05-10T00:00:00Z',
          },
          marketplace: {
            status: 'priced',
            estimated_price: 16,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: ['below_target', 'high_priority_available', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
          display_currency: 'EUR',
        },
        {
          id: 2,
          user_id: 1,
          release_id: 402,
          title: 'Hidden Opportunity',
          artist: 'Artist B',
          year: 2001,
          cover_url: null,
          date_added: '2026-05-10T00:00:00Z',
          local: {
            priority: 'high',
            target_price: null,
            target_price_eur: null,
            minimum_condition: null,
            note: '',
            hidden: true,
            resolved: false,
          },
          source: {
            origin: 'discogs',
            status: 'active',
            last_seen_at: '2026-05-10T00:00:00Z',
          },
          marketplace: {
            status: 'priced',
            estimated_price: 15,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: ['high_priority_available'],
            default_visible: false,
            is_in_collection: false,
          },
          display_currency: 'EUR',
        },
        {
          id: 3,
          user_id: 1,
          release_id: 403,
          title: 'Resolved Opportunity',
          artist: 'Artist C',
          year: 2002,
          cover_url: null,
          date_added: '2026-05-10T00:00:00Z',
          local: {
            priority: 'normal',
            target_price: null,
            target_price_eur: null,
            minimum_condition: null,
            note: '',
            hidden: false,
            resolved: true,
          },
          source: {
            origin: 'discogs',
            status: 'active',
            last_seen_at: '2026-05-10T00:00:00Z',
          },
          marketplace: {
            status: 'priced',
            estimated_price: 14,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: ['available_again'],
            default_visible: false,
            is_in_collection: false,
          },
          display_currency: 'EUR',
        },
      ],
      summary: {
        total: 3,
        active: 1,
        hidden: 1,
        resolved: 1,
        missingFromSource: 0,
        priced: 3,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    await clickRadarFilter(rendered, 'opportunities');

    const text = rendered.textContent ?? '';

    expect(text).toContain('Visible Opportunity');
    expect(text).toContain(messages['radar.opportunity.below_target']);
    expect(text).toContain(messages['radar.opportunity.high_priority_available']);
    expect(text).toContain(messages['radar.opportunity.already_in_collection']);
    expect(text).not.toContain('Hidden Opportunity');
    expect(text).not.toContain('Resolved Opportunity');
    expect(text).toContain(messages['radar.filter.hiddenResolved']);
  });

  it('shows navigable collection match links for single and multiple local copies', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 21,
          release_id: 621,
          title: 'No Match',
          artist: 'Artist A',
        }),
        createRadarRelease({
          id: 22,
          release_id: 622,
          title: 'Single Match',
          artist: 'Artist B',
          opportunity: {
            reasons: ['already_in_collection'],
            default_visible: true,
            is_in_collection: true,
            collection_match: {
              primary_release_id: 91,
              copy_count: 1,
            },
          },
        }),
        createRadarRelease({
          id: 23,
          release_id: 623,
          title: 'Multiple Match',
          artist: 'Artist C',
          opportunity: {
            reasons: ['already_in_collection'],
            default_visible: true,
            is_in_collection: true,
            collection_match: {
              primary_release_id: 92,
              copy_count: 3,
            },
          },
        }),
      ],
      summary: {
        total: 3,
        active: 3,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 3,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const singleLink = rendered.querySelector('a[data-radar-collection="22"]') as HTMLAnchorElement | null;
    const multipleLink = rendered.querySelector('a[data-radar-collection="23"]') as HTMLAnchorElement | null;
    const missingLink = rendered.querySelector('a[data-radar-collection="21"]');
    const text = rendered.textContent ?? '';

    expect(missingLink).toBeNull();
    expect(singleLink?.getAttribute('href')).toBe('/collection/91');
    expect(multipleLink?.getAttribute('href')).toBe('/collection/92');
    expect(text).toContain('View 1 copy in your collection');
    expect(text).toContain('View 3 copies in your collection');
  });

  it('shows a navigable Radar detail link for each release row', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 22,
          release_id: 622,
          title: 'Single Match',
          artist: 'Artist B',
        }),
      ],
      summary: {
        total: 1,
        active: 1,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 1,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const detailLink = rendered.querySelector('a[data-radar-detail="22"]') as HTMLAnchorElement | null;

    expect(detailLink?.getAttribute('href')).toBe('/radar/22');
    expect(detailLink?.textContent).toContain('Single Match');
  });

  it('filters Radar rows from the normalized list contract and shows natural state labels', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 11,
          release_id: 511,
          title: 'Below Target',
          artist: 'Artist A',
          year: 1997,
          local: {
            priority: 'high',
            target_price: 18,
            target_price_eur: 18,
          },
          marketplace: {
            status: 'priced',
            estimated_price: 16,
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            reasons: ['below_target', 'high_priority_available', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
        }),
        createRadarRelease({
          id: 12,
          release_id: 512,
          title: 'Pending Hidden',
          artist: 'Artist B',
          year: 2001,
          local: {
            priority: 'high',
            hidden: true,
          },
        }),
        createRadarRelease({
          id: 13,
          release_id: 513,
          title: 'Resolved Error',
          artist: 'Artist C',
          year: 2004,
          local: {
            resolved: true,
          },
          marketplace: {
            status: 'failed',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
        }),
        createRadarRelease({
          id: 14,
          release_id: 514,
          title: 'No Price',
          artist: 'Artist D',
          year: 2009,
          source: {
            status: 'missing',
            last_seen_at: '2026-05-09T00:00:00Z',
          },
          marketplace: {
            status: 'unavailable',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
        }),
        createRadarRelease({
          id: 15,
          release_id: 515,
          title: 'Back Again',
          artist: 'Artist E',
          year: 2015,
          marketplace: {
            status: 'priced',
            estimated_price: 20,
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            reasons: ['available_again'],
            default_visible: true,
          },
        }),
        createRadarRelease({
          id: 16,
          release_id: 516,
          title: 'Active Pending',
          artist: 'Artist F',
          year: 2018,
          opportunity: {
            default_visible: true,
          },
        }),
        createRadarRelease({
          id: 17,
          release_id: 517,
          title: 'Active Failed',
          artist: 'Artist G',
          year: 2019,
          marketplace: {
            status: 'failed',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            default_visible: true,
          },
        }),
      ],
      summary: {
        total: 7,
        active: 4,
        hidden: 1,
        resolved: 1,
        missingFromSource: 1,
        priced: 2,
        pending: 2,
        failed: 2,
        unavailable: 1,
      },
    });

    const rendered = await renderRadar();
    const text = () => rendered.textContent ?? '';

    expect(text()).toContain('Below Target');
    expect(text()).toContain('Back Again');
    expect(text()).toContain('Active Pending');
    expect(text()).toContain('Active Failed');
    expect(text()).not.toContain('Pending Hidden');
    expect(text()).not.toContain('Resolved Error');
    expect(text()).not.toContain('No Price');
    expect(text()).toContain(messages['radar.opportunity.below_target']);
    expect(text()).toContain(messages['radar.opportunity.high_priority_available']);
    expect(text()).toContain(messages['radar.opportunity.available_again']);
    expect(text()).toContain(messages['radar.opportunity.already_in_collection']);
    expect(text()).toContain(messages['radar.state.pending']);
    expect(text()).toContain(messages['radar.state.failed']);

    await clickRadarFilter(rendered, 'opportunities');
    expect(text()).toContain('Below Target');
    expect(text()).toContain('Back Again');
    expect(text()).not.toContain('Pending Hidden');
    expect(text()).not.toContain('Resolved Error');

    await clickRadarFilter(rendered, 'below_target');
    expect(text()).toContain('Below Target');
    expect(text()).not.toContain('Back Again');

    await clickRadarFilter(rendered, 'high_priority');
    expect(text()).toContain('Below Target');
    expect(text()).not.toContain('Pending Hidden');
    expect(text()).not.toContain('Resolved Error');

    await clickRadarFilter(rendered, 'in_collection');
    expect(text()).toContain('Below Target');
    expect(text()).not.toContain('Back Again');

    await clickRadarFilter(rendered, 'attention');
    expect(text()).toContain('Active Pending');
    expect(text()).toContain('Active Failed');
    expect(text()).not.toContain('Pending Hidden');
    expect(text()).not.toContain('Resolved Error');
    expect(text()).not.toContain('No Price');
    expect(text()).not.toContain('Below Target');
    expect(text()).not.toContain('Back Again');

    await clickRadarFilter(rendered, 'hidden_resolved');
    expect(text()).toContain('Pending Hidden');
    expect(text()).toContain('Resolved Error');
    expect(text()).toContain(messages['radar.state.hidden']);
    expect(text()).toContain(messages['radar.state.resolved']);
    expect(text()).not.toContain('Below Target');

    await clickRadarFilter(rendered, 'missing_from_source');
    expect(text()).toContain('No Price');
    expect(text()).toContain(messages['radar.state.unavailable']);
    expect(text()).toContain(messages['radar.state.missingFromSource']);
    expect(text()).not.toContain('Below Target');

    await clickRadarFilter(rendered, 'pending');
    expect(text()).toContain('Active Pending');
    expect(text()).not.toContain('Pending Hidden');
    expect(text()).not.toContain('Resolved Error');

    await clickRadarFilter(rendered, 'failed');
    expect(text()).toContain('Active Failed');
    expect(text()).not.toContain('Resolved Error');
    expect(text()).not.toContain('Pending Hidden');
  });

  it('renders operational metric filters in the header and applies the matching list view', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 21,
          release_id: 611,
          title: 'Operational Opportunity',
          artist: 'Artist Ops',
          local: {
            priority: 'high',
            target_price: 22,
            target_price_eur: 22,
          },
          marketplace: {
            status: 'priced',
            estimated_price: 19,
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            reasons: ['below_target', 'high_priority_available', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
        }),
        createRadarRelease({
          id: 22,
          release_id: 612,
          title: 'Waiting On Price',
          artist: 'Artist Waits',
          opportunity: {
            default_visible: true,
          },
        }),
        createRadarRelease({
          id: 23,
          release_id: 613,
          title: 'Needs Retry',
          artist: 'Artist Retry',
          marketplace: {
            status: 'failed',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            default_visible: true,
          },
        }),
      ],
      summary: {
        total: 3,
        active: 3,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 1,
        pending: 1,
        failed: 1,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const text = rendered.textContent ?? '';

    expect(text).toContain(messages['radar.filter.opportunities']);
    expect(text).toContain(messages['radar.filter.belowTarget']);
    expect(text).toContain(messages['radar.filter.highPriority']);
    expect(text).toContain(messages['radar.filter.inCollection']);
    expect(text).toContain(messages['radar.filter.attention']);

    await clickRadarFilter(rendered, 'attention');

    const attentionText = rendered.textContent ?? '';

    expect(attentionText).toContain('Waiting On Price');
    expect(attentionText).toContain('Needs Retry');
    expect(attentionText).not.toContain('Operational Opportunity');
  });

  it('unifies Radar metrics and auxiliary filters into one informative filter panel', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 31,
          release_id: 631,
          title: 'Below Target Metric',
          artist: 'Artist Metric',
          local: {
            priority: 'high',
            target_price: 22,
            target_price_eur: 22,
          },
          marketplace: {
            status: 'priced',
            estimated_price: 19,
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            reasons: ['below_target', 'high_priority_available', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
        }),
        createRadarRelease({
          id: 32,
          release_id: 632,
          title: 'Waiting Filter',
          artist: 'Artist Wait',
          opportunity: {
            default_visible: true,
          },
        }),
        createRadarRelease({
          id: 33,
          release_id: 633,
          title: 'Failed Filter',
          artist: 'Artist Fail',
          marketplace: {
            status: 'failed',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            default_visible: true,
          },
        }),
        createRadarRelease({
          id: 34,
          release_id: 634,
          title: 'Hidden Filter',
          artist: 'Artist Hide',
          local: {
            hidden: true,
          },
        }),
        createRadarRelease({
          id: 35,
          release_id: 635,
          title: 'Missing Filter',
          artist: 'Artist Missing',
          source: {
            status: 'missing',
            last_seen_at: '2026-05-09T00:00:00Z',
          },
          marketplace: {
            status: 'unavailable',
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
        }),
      ],
      summary: {
        total: 5,
        active: 3,
        hidden: 1,
        resolved: 0,
        missingFromSource: 1,
        priced: 1,
        pending: 2,
        failed: 1,
        unavailable: 1,
      },
    });

    const rendered = await renderRadar();
    const filterPanels = rendered.querySelectorAll('[data-radar-filter-panel="true"]');

    expect(filterPanels).toHaveLength(1);

    const panel = filterPanels[0] as HTMLElement;
    const panelFilters = panel.querySelectorAll('button[data-radar-filter]');
    const allFilters = rendered.querySelectorAll('button[data-radar-filter]');

    expect(panelFilters).toHaveLength(allFilters.length);

    const expectations: Array<[string, string, string]> = [
      ['all', messages['radar.filter.all'], '3'],
      ['opportunities', messages['radar.filter.opportunities'], '1'],
      ['below_target', messages['radar.filter.belowTarget'], '1'],
      ['high_priority', messages['radar.filter.highPriority'], '1'],
      ['in_collection', messages['radar.filter.inCollection'], '1'],
      ['attention', messages['radar.filter.attention'], '2'],
      ['hidden_resolved', messages['radar.filter.hiddenResolved'], '1'],
      ['missing_from_source', messages['radar.filter.missingFromSource'], '1'],
      ['pending', messages['radar.filter.pending'], '1'],
      ['failed', messages['radar.filter.failed'], '1'],
    ];

    for (const [filterId, label, count] of expectations) {
      const button = panel.querySelector(`button[data-radar-filter="${filterId}"]`) as HTMLButtonElement | null;

      expect(button?.textContent).toContain(label);
      expect(button?.textContent).toContain(count);
    }
  });

  it('shows Wantlist template actions, preview validation, and applies the preview into Radar', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 21,
          release_id: 611,
          title: 'Operational Opportunity',
          artist: 'Artist Ops',
          local: {
            priority: 'high',
            target_price: 22,
            target_price_eur: 22,
          },
          marketplace: {
            status: 'priced',
            estimated_price: 19,
            last_checked_at: RADAR_TEST_TIMESTAMP,
          },
          opportunity: {
            reasons: ['below_target'],
            default_visible: true,
            is_in_collection: false,
          },
        }),
      ],
      summary: {
        total: 1,
        active: 1,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 1,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const importAction = findButtonByText(rendered, messages['radar.importAction']);
    const csvButton = findButtonByText(rendered, messages['radar.import.downloadCsvTemplate']);
    const xlsxButton = findButtonByText(rendered, messages['radar.import.downloadXlsxTemplate']);
    const uploadInput = rendered.querySelector('input[type="file"]') as HTMLInputElement | null;
    const importHeading = findHeadingByText(rendered, messages['radar.import.title']);
    const radarList = rendered.querySelector('ul');

    expect(importAction).not.toBeNull();
    expect(rendered.textContent).toContain(messages['radar.import.title']);
    expect(rendered.textContent).toContain(messages['radar.import.description']);
    expect(rendered.textContent).toContain(messages['radar.import.requiredHint']);
    expect(csvButton).not.toBeNull();
    expect(xlsxButton).not.toBeNull();
    expect(uploadInput).not.toBeNull();
    expect(importHeading).not.toBeNull();
    expect(radarList).not.toBeNull();
    if (!importHeading || !radarList) {
      throw new Error('Expected Radar import heading and list to exist');
    }

    const scrollIntoView = vi.fn();
    Object.defineProperty(importHeading, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    await act(async () => {
      importAction?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(importHeading);
    const importFollowsRadarList = Boolean(
      radarList.compareDocumentPosition(importHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(importFollowsRadarList).toBe(true);

    await act(async () => {
      csvButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      xlsxButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(downloadRadarWantlistTemplate).toHaveBeenNthCalledWith(1, 'csv');
    expect(downloadRadarWantlistTemplate).toHaveBeenNthCalledWith(2, 'xlsx');

    await uploadWantlistCsv(rendered);

    const text = rendered.textContent ?? '';

    expect(previewRadarWantlist).toHaveBeenCalledTimes(1);
    expect(text).toContain(messages['radar.import.previewTitle']);
    expect(text).toContain(messages['radar.import.totalRows']);
    expect(text).toContain(messages['radar.import.validRows']);
    expect(text).toContain(messages['radar.import.invalidRows']);
    expect(text).toContain(messages['radar.import.mappedColumns']);
    expect(text).toContain(messages['radar.import.ignoredColumns']);
    expect(text).toContain(messages['radar.import.previewRows']);
    expect(text).toContain('Color');
    expect(text).toContain('Kraftwerk');
    expect(text).toContain(messages['radar.import.rowError']);

    const previewTable = rendered.querySelector('[data-radar-import-preview-table="true"]') as HTMLDivElement | null;

    expect(previewTable).not.toBeNull();
    expect(previewTable?.className).toContain('overflow-x-auto');
    expect(previewTable?.className).toContain('overflow-y-auto');

    const applyButton = findButtonByText(rendered, messages['radar.import.apply']);

    expect(applyButton).not.toBeNull();

    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(applyRadarWantlistPreview).toHaveBeenCalledWith('preview-1');
    expect(rendered.textContent ?? '').toContain(messages['radar.import.applySummary']);
    expect(rendered.textContent ?? '').toContain(messages['radar.import.applyBreakdown']);
    expect(rendered.textContent ?? '').toContain(messages['radar.import.applyNextStep']);
    expect(rendered.textContent ?? '').toContain('Computer World');
    expect(startRadarUpdateRun).not.toHaveBeenCalled();
  });

  it('returns to the full Radar list after applying an import from a filtered view', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue(
      createRadarResponse(
        [
          createRadarRelease({
            id: 21,
            release_id: 611,
            title: 'Operational Opportunity',
            artist: 'Artist Ops',
            local: {
              priority: 'high',
              target_price: 22,
              target_price_eur: 22,
            },
            marketplace: {
              status: 'priced',
              estimated_price: 19,
              last_checked_at: RADAR_TEST_TIMESTAMP,
            },
            opportunity: {
              reasons: ['below_target'],
              default_visible: true,
              is_in_collection: false,
            },
          }),
        ],
        { priced: 1 },
      ),
    );

    const rendered = await renderRadar();

    await clickRadarFilter(rendered, 'opportunities');
    expect(rendered.textContent ?? '').toContain('Operational Opportunity');
    expect(rendered.textContent ?? '').not.toContain('Computer World');

    await uploadWantlistCsv(rendered);

    const applyButton = findButtonByText(rendered, messages['radar.import.apply']);

    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = rendered.textContent ?? '';
    const allFilter = rendered.querySelector('button[data-radar-filter="all"]') as HTMLButtonElement | null;
    const opportunitiesFilter = rendered.querySelector('button[data-radar-filter="opportunities"]') as HTMLButtonElement | null;

    expect(text).toContain(messages['radar.import.applySummary']);
    expect(text).toContain('Computer World');
    expect(allFilter?.className).toContain('bg-brand-400/15');
    expect(opportunitiesFilter?.className).not.toContain('bg-brand-400/15');
  });

  it('shows stopped Radar update state after a run has been halted', async () => {
    authState.capabilities.canUseRadar = true;
    getRadarStatus.mockResolvedValue({
      phase: 'stopped',
      current: 1,
      total: 4,
      pending: 3,
      progressPercent: 25,
      message: 'Radar stopped after reviewing 1 releases. 3 still need price review.',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      wantlist: {
        totalFetched: 4,
        added: 2,
        updated: 1,
        reactivated: 0,
        markedMissing: 1,
        ignored: 0,
      },
      isRunning: false,
      isTerminal: true,
      canStop: false,
    });

    const text = (await renderRadar()).textContent ?? '';

    expect(text).toContain(messages['radar.updatePhase.stopped']);
    expect(text).toContain(messages['radar.updateAction']);
    expect(text).toContain('1');
    expect(text).toContain('4');
    expect(text).toContain('3');
  });

  it('shows the account-unavailable state before the blocked state when account status cannot be loaded', async () => {
    authState.accountUnavailable = true;

    const text = (await renderRadar()).textContent ?? '';

    expect(text).toContain(messages['radar.accountUnavailable']);
    expect(text).not.toContain(messages['radar.blockedTitle']);
    expect(getRadar).not.toHaveBeenCalled();
    expect(getRadarStatus).not.toHaveBeenCalled();
  });

  it('renders dense Radar rows for scanning and removes the old inline editors', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        createRadarRelease({
          id: 7,
          release_id: 303,
          title: 'Editable Release',
          artist: 'Artist C',
          year: 1998,
          date_added: '2026-05-10T00:00:00Z',
          local: {
            priority: 'normal',
            target_price: 12.5,
            target_price_eur: 10.42,
            minimum_condition: 'VG+',
            note: 'Start here',
            hidden: false,
            resolved: false,
          },
          marketplace: {
            status: 'priced',
            estimated_price: 24,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          opportunity: {
            reasons: ['high_priority_available'],
            default_visible: true,
            is_in_collection: false,
          },
          display_currency: 'USD',
        }),
      ],
      summary: {
        total: 1,
        active: 1,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 1,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const discogsLink = rendered.querySelector('a[data-radar-discogs="7"]') as HTMLAnchorElement | null;
    const text = rendered.textContent ?? '';

    expect(text).toContain('Editable Release');
    expect(text).toContain('Artist C');
    expect(text).toContain(formatCurrency(24, 'USD'));
    expect(text).toContain(formatCurrency(12.5, 'USD'));
    expect(text).toContain(messages['radar.priority.normal']);
    expect(text).toContain(formatDate('2026-05-10T00:00:00Z'));
    expect(text).toContain(messages['radar.opportunity.high_priority_available']);
    expect(discogsLink?.getAttribute('href')).toBe('https://www.discogs.com/release/303');
    expect(rendered.querySelector('select[name="radar-priority-7"]')).toBeNull();
    expect(rendered.querySelector('input[name="radar-target-price-7"]')).toBeNull();
    expect(rendered.querySelector('select[name="radar-minimum-condition-7"]')).toBeNull();
    expect(rendered.querySelector('textarea[name="radar-note-7"]')).toBeNull();
    expect(rendered.querySelector('input[name="radar-hidden-7"]')).toBeNull();
    expect(rendered.querySelector('input[name="radar-resolved-7"]')).toBeNull();
    expect(rendered.querySelector('button[data-radar-save="7"]')).toBeNull();
    expect(updateRadarRelease).not.toHaveBeenCalled();
  });
});
