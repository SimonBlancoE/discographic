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
const updateRadarRelease = vi.hoisted(() => vi.fn());

const messages = {
  'radar.eyebrow': 'Radar',
  'radar.blockedTitle': 'Connect your Discogs account',
  'radar.blockedBody': 'Radar needs a configured Discogs account before it can show your buying workspace.',
  'radar.openSettings': 'Open Settings',
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
    updateRadarRelease,
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
    updateRadarRelease.mockReset();
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

  it('shows the account-unavailable state before the blocked state when account status cannot be loaded', async () => {
    authState.accountUnavailable = true;

    const text = (await renderRadar()).textContent ?? '';

    expect(text).toContain(messages['radar.accountUnavailable']);
    expect(text).not.toContain(messages['radar.blockedTitle']);
    expect(getRadar).not.toHaveBeenCalled();
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
