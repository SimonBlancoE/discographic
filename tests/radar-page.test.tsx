/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Radar from '../src/pages/Radar';

const authState = vi.hoisted(() => ({
  accountUnavailable: false,
  capabilities: {
    canUseRadar: false,
  },
}));

const getRadar = vi.hoisted(() => vi.fn());
const syncRadar = vi.hoisted(() => vi.fn());
const previewRadarWantlist = vi.hoisted(() => vi.fn());
const downloadRadarWantlistTemplate = vi.hoisted(() => vi.fn());
const updateRadarRelease = vi.hoisted(() => vi.fn());
const getRadarStatus = vi.hoisted(() => vi.fn());
const enrichRadar = vi.hoisted(() => vi.fn());
const stopRadarEnrich = vi.hoisted(() => vi.fn());

const messages = {
  'radar.eyebrow': 'Radar',
  'radar.blockedTitle': 'Connect your Discogs account',
  'radar.blockedBody': 'Radar needs a configured Discogs account before it can show your buying workspace.',
  'radar.openSettings': 'Open Settings',
  'radar.syncAction': 'Sync Wantlist',
  'radar.syncing': 'Syncing Wantlist...',
  'radar.syncResultTitle': 'Wantlist synced',
  'radar.syncResultSummary': 'Checked 1 wanted release from Discogs.',
  'radar.syncBreakdown': '1 new · 0 updated · 0 back again · 0 missing now',
  'radar.syncError': 'Radar could not sync from Discogs: boom',
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
  'radar.enrichTitle': 'Radar Marketplace',
  'radar.enrichBody': 'Enrich wanted releases with release-level minimum price data and preserve pending, failed, and no-price states so retryable rows stay truthful.',
  'radar.enrichState.idle': 'Ready',
  'radar.enrichState.running': 'Running',
  'radar.enrichState.completed': 'Completed',
  'radar.enrichState.failed': 'Failed',
  'radar.enrichState.stopped': 'Stopped',
  'radar.enrichStart': 'Enrich Radar',
  'radar.enrichStop': 'Stop',
  'radar.enrichStatus': 'Status',
  'radar.enrichCurrent': 'Current',
  'radar.enrichTotal': 'Total',
  'radar.enrichPending': 'Pending',
  'radar.enrichStatusError': 'Radar enrichment status could not be loaded. Try again in a moment.',
  'radar.emptyTitle': 'Your Radar is ready',
  'radar.emptyBody': 'Your list is empty for now. When Wantlist releases arrive, Radar will keep their local decisions and market state here.',
  'radar.accountUnavailable': 'Discogs account status could not be loaded. Reload the page or review Settings before opening Radar.',
  'radar.import.title': 'Wantlist fallback import',
  'radar.import.description': 'Upload a CSV or XLSX file to preview valid and invalid Wantlist rows before anything is applied.',
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
  'radar.openDiscogs': 'Open on Discogs',
  'radar.priority': 'Priority',
  'radar.priority.low': 'Low',
  'radar.priority.normal': 'Normal',
  'radar.priority.high': 'High',
  'radar.targetPrice': 'Target price',
  'radar.minimumCondition': 'Minimum condition',
  'radar.minimumCondition.info': 'Informational only in Radar v1.',
  'radar.minimumCondition.none': 'No preference',
  'radar.minimumCondition.M': 'Mint (M)',
  'radar.minimumCondition.NM': 'Near Mint (NM)',
  'radar.minimumCondition.VG+': 'Very Good Plus (VG+)',
  'radar.minimumCondition.VG': 'Very Good (VG)',
  'radar.minimumCondition.G+': 'Good Plus (G+)',
  'radar.minimumCondition.G': 'Good (G)',
  'radar.minimumCondition.F': 'Fair (F)',
  'radar.minimumCondition.P': 'Poor (P)',
  'radar.note': 'Note',
  'radar.hidden': 'Hidden',
  'radar.resolved': 'Resolved',
  'radar.save': 'Save local decision',
  'radar.saving': 'Saving...',
  'radar.saveFailed': 'Radar could not save your local decision. Try again.',
} satisfies Record<string, string>;

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key as keyof typeof messages] ?? key,
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getRadar,
    syncRadar,
    previewRadarWantlist,
    downloadRadarWantlistTemplate,
    updateRadarRelease,
    getRadarStatus,
    enrichRadar,
    stopRadarEnrich,
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

describe('Radar page', () => {
  beforeEach(() => {
    authState.accountUnavailable = false;
    authState.capabilities.canUseRadar = false;
    getRadar.mockReset();
    syncRadar.mockReset();
    previewRadarWantlist.mockReset();
    downloadRadarWantlistTemplate.mockReset();
    updateRadarRelease.mockReset();
    getRadarStatus.mockReset();
    enrichRadar.mockReset();
    stopRadarEnrich.mockReset();
    getRadar.mockResolvedValue({
      items: [],
      summary: {
        total: 0,
        active: 0,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });
    getRadarStatus.mockResolvedValue({
      status: 'idle',
      current: 0,
      total: 0,
      pending: 2,
      progressPercent: 0,
      message: 'Radar is ready to enrich your Wantlist.',
      startedAt: null,
      finishedAt: null,
      isRunning: false,
      isTerminal: false,
    });
    syncRadar.mockResolvedValue({
      radar: {
        items: [
          {
            id: 1,
            user_id: 1,
            release_id: 901,
            title: 'Fresh Want',
            artist: 'New Artist',
            year: 2024,
            cover_url: null,
            date_added: '2026-05-10T00:00:00Z',
            local: {
              priority: 'normal',
              target_price: null,
              target_price_eur: null,
              minimum_condition: null,
              note: '',
              hidden: false,
              resolved: false,
            },
            source: {
              origin: 'discogs',
              status: 'active',
              last_seen_at: '2026-05-10T12:00:00Z',
            },
            marketplace: {
              status: 'pending',
              estimated_price: null,
              listing_status: null,
              listing_price: null,
              listing_currency: null,
              listing_price_eur: null,
              last_checked_at: null,
            },
            timestamps: {
              created_at: '2026-05-10T12:00:00Z',
              updated_at: '2026-05-10T12:00:00Z',
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
        totalFetched: 1,
        added: 1,
        updated: 0,
        reactivated: 0,
        markedMissing: 0,
        ignored: 0,
      },
    });
    previewRadarWantlist.mockResolvedValue({
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
    updateRadarRelease.mockResolvedValue({
      items: [],
      summary: {
        total: 0,
        active: 0,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });
    enrichRadar.mockResolvedValue({ ok: true });
    stopRadarEnrich.mockResolvedValue({ ok: true });
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
    expect(text).toContain(messages['radar.summary.total']);
    expect(text).toContain(messages['radar.summary.pending']);
    expect(text).toContain(messages['radar.enrichTitle']);
    expect(text).toContain(messages['radar.enrichStart']);
    expect(text).toContain(messages['radar.enrichPending']);
    expect(text).toContain(messages['radar.import.title']);
    expect(text).toContain(messages['radar.emptyTitle']);
    expect(text).toContain(messages['radar.emptyBody']);
  });

  it('syncs the wantlist and shows the sync result with the refreshed Radar list', async () => {
    authState.capabilities.canUseRadar = true;

    const rendered = await renderRadar();
    const syncButton = Array.from(rendered.querySelectorAll('button')).find(
      (button) => button.textContent === messages['radar.syncAction'],
    );

    expect(syncButton).toBeTruthy();

    await act(async () => {
      syncButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = rendered.textContent ?? '';

    expect(syncRadar).toHaveBeenCalledTimes(1);
    expect(text).toContain(messages['radar.syncResultTitle']);
    expect(text).toContain(messages['radar.syncResultSummary']);
    expect(text).toContain(messages['radar.syncBreakdown']);
    expect(text).toContain('Fresh Want');
    expect(text).toContain('New Artist');
  });

  it('shows Wantlist template actions and preview validation when a file is uploaded', async () => {
    authState.capabilities.canUseRadar = true;

    const rendered = await renderRadar();
    const csvButton = Array.from(rendered.querySelectorAll('button')).find((button) => button.textContent === messages['radar.import.downloadCsvTemplate']);
    const xlsxButton = Array.from(rendered.querySelectorAll('button')).find((button) => button.textContent === messages['radar.import.downloadXlsxTemplate']);
    const uploadInput = rendered.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(rendered.textContent).toContain(messages['radar.import.title']);
    expect(rendered.textContent).toContain(messages['radar.import.description']);
    expect(rendered.textContent).toContain(messages['radar.import.requiredHint']);
    expect(csvButton).not.toBeNull();
    expect(xlsxButton).not.toBeNull();
    expect(uploadInput).not.toBeNull();

    await act(async () => {
      csvButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      xlsxButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(downloadRadarWantlistTemplate).toHaveBeenNthCalledWith(1, 'csv');
    expect(downloadRadarWantlistTemplate).toHaveBeenNthCalledWith(2, 'xlsx');

    const file = new File(['release_id\n12345\n'], 'wantlist.csv', { type: 'text/csv' });
    Object.defineProperty(uploadInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      uploadInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

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
  });

  it('shows stopped Radar enrichment state after a run has been halted', async () => {
    authState.capabilities.canUseRadar = true;
    getRadarStatus.mockResolvedValue({
      status: 'stopped',
      current: 1,
      total: 4,
      pending: 3,
      progressPercent: 25,
      message: 'Radar stopped after 1 releases. 3 remain pending or failed.',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      isRunning: false,
      isTerminal: true,
    });

    const text = (await renderRadar()).textContent ?? '';

    expect(text).toContain(messages['radar.enrichState.stopped']);
    expect(text).toContain(messages['radar.enrichStart']);
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

  it('edits a local Radar decision and keeps the Discogs release action local-only', async () => {
    authState.capabilities.canUseRadar = true;
    getRadar.mockResolvedValue({
      items: [
        {
          id: 7,
          user_id: 1,
          release_id: 303,
          title: 'Editable Release',
          artist: 'Artist C',
          year: 1998,
          cover_url: null,
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
          source: {
            origin: 'discogs',
            status: 'active',
            last_seen_at: '2026-05-10T00:00:00Z',
          },
          marketplace: {
            status: 'priced',
            estimated_price: 24,
            listing_status: 'For Sale',
            listing_price: 30,
            listing_currency: 'EUR',
            listing_price_eur: 25,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T01:00:00Z',
          },
          display_currency: 'USD',
        },
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
    updateRadarRelease.mockResolvedValue({
      items: [
        {
          id: 7,
          user_id: 1,
          release_id: 303,
          title: 'Editable Release',
          artist: 'Artist C',
          year: 1998,
          cover_url: null,
          date_added: '2026-05-10T00:00:00Z',
          local: {
            priority: 'high',
            target_price: 14.5,
            target_price_eur: 12.08,
            minimum_condition: 'NM',
            note: 'Watch copy',
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
            estimated_price: 24,
            listing_status: 'For Sale',
            listing_price: 30,
            listing_currency: 'EUR',
            listing_price_eur: 25,
            last_checked_at: '2026-05-10T00:00:00Z',
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: '2026-05-10T02:00:00Z',
          },
          display_currency: 'USD',
        },
      ],
      summary: {
        total: 1,
        active: 0,
        hidden: 1,
        resolved: 0,
        missingFromSource: 0,
        priced: 1,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadar();
    const prioritySelect = rendered.querySelector('select[name="radar-priority-7"]') as HTMLSelectElement | null;
    const targetInput = rendered.querySelector('input[name="radar-target-price-7"]') as HTMLInputElement | null;
    const conditionSelect = rendered.querySelector('select[name="radar-minimum-condition-7"]') as HTMLSelectElement | null;
    const noteInput = rendered.querySelector('textarea[name="radar-note-7"]') as HTMLTextAreaElement | null;
    const hiddenInput = rendered.querySelector('input[name="radar-hidden-7"]') as HTMLInputElement | null;
    const saveButton = rendered.querySelector('button[data-radar-save="7"]') as HTMLButtonElement | null;
    const discogsLink = rendered.querySelector('a[data-radar-discogs="7"]') as HTMLAnchorElement | null;

    expect(prioritySelect).not.toBeNull();
    expect(targetInput?.value).toBe('12.50');
    expect(conditionSelect?.value).toBe('VG+');
    expect(noteInput?.value).toBe('Start here');
    expect(discogsLink?.getAttribute('href')).toBe('https://www.discogs.com/release/303');

    await act(async () => {
      if (!prioritySelect || !targetInput || !conditionSelect || !noteInput || !hiddenInput || !saveButton) {
        throw new Error('Missing Radar editor controls');
      }

      prioritySelect.value = 'high';
      prioritySelect.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.value = '14.50';
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      conditionSelect.value = 'NM';
      conditionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      noteInput.value = 'Watch copy';
      noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInput.click();
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateRadarRelease).toHaveBeenCalledWith(7, {
      local: {
        priority: 'high',
        target_price: 14.5,
        minimum_condition: 'NM',
        note: 'Watch copy',
        hidden: true,
        resolved: false,
      },
    });

    expect(rendered.textContent ?? '').toContain(messages['radar.minimumCondition.info']);
    expect((rendered.querySelector('input[name="radar-target-price-7"]') as HTMLInputElement | null)?.value).toBe('14.50');
  });
});
