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
  'radar.emptyTitle': 'Your Radar is ready',
  'radar.emptyBody': 'Your list is empty for now. When Wantlist releases arrive, Radar will keep their local decisions and market state here.',
  'radar.accountUnavailable': 'Discogs account status could not be loaded. Reload the page or review Settings before opening Radar.',
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
    syncRadar.mockReset();
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
  });

  it('fetches and shows an empty Radar workspace summary when the Discogs account is configured', async () => {
    authState.capabilities.canUseRadar = true;

    const rendered = await renderRadar();
    const text = rendered.textContent ?? '';

    expect(getRadar).toHaveBeenCalledTimes(1);
    expect(text).toContain(messages['radar.eyebrow']);
    expect(text).toContain(messages['radar.summary.total']);
    expect(text).toContain(messages['radar.summary.pending']);
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

  it('shows the account-unavailable state before the blocked state when account status cannot be loaded', async () => {
    authState.accountUnavailable = true;

    const text = (await renderRadar()).textContent ?? '';

    expect(text).toContain(messages['radar.accountUnavailable']);
    expect(text).not.toContain(messages['radar.blockedTitle']);
    expect(getRadar).not.toHaveBeenCalled();
  });
});
