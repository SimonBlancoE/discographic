/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RadarReleaseDetail from '../src/pages/RadarReleaseDetail';
import type { RadarRelease } from '../shared/contracts/radar.js';

const getRadarRelease = vi.hoisted(() => vi.fn());
const updateRadarRelease = vi.hoisted(() => vi.fn());

const messages = {
  'client.networkError': 'Network error',
  'radar.detailBack': 'Back to Radar',
  'radar.detailLoading': 'Loading Radar release...',
  'radar.detailLoadFailed': 'Radar release could not be loaded. Try again in a moment.',
  'radar.detailNotFound': 'Radar release not found.',
  'radar.detailMarketplacePrice': 'Marketplace estimate',
  'radar.detailSourceOrigin': 'Source',
  'radar.detailSourceStatus': 'Source status',
  'radar.sourceOrigin.discogs': 'Discogs',
  'radar.sourceOrigin.file': 'File import',
  'radar.sourceOrigin.both': 'Discogs + file',
  'radar.sourceOrigin.none': 'Local only',
  'radar.sourceStatus.active': 'Active',
  'radar.sourceStatus.missing': 'Missing from source',
  'radar.openDiscogs': 'Open on Discogs',
  'radar.priority': 'Priority',
  'radar.priority.low': 'Low',
  'radar.priority.normal': 'Normal',
  'radar.priority.high': 'High',
  'radar.targetPrice': 'Target price',
  'radar.minimumCondition': 'Minimum condition',
  'radar.minimumCondition.info': 'Saved for future listing filters. Informational only in Radar v1.',
  'radar.minimumCondition.none': 'No preference',
  'radar.minimumCondition.VG+': 'Very Good Plus (VG+)',
  'radar.note': 'Note',
  'radar.hidden': 'Hidden',
  'radar.resolved': 'Resolved',
  'radar.save': 'Save local decision',
  'radar.saving': 'Saving...',
  'radar.saveStatus.saved': 'All local changes saved.',
  'radar.saveStatus.unsaved': 'You have unsaved local changes.',
  'radar.saveStatus.failed': 'Saving failed. Your draft is still here.',
  'radar.unsavedChangesConfirm': 'You have unsaved Radar changes. Leave this page?',
  'radar.saveFailed': 'Radar could not save your local decision. Try again.',
  'radar.state.pending': 'Pending update',
  'radar.state.unavailable': 'No price available',
  'radar.state.failed': 'Update failed',
  'radar.state.hidden': 'Hidden',
  'radar.state.resolved': 'Resolved',
  'radar.state.missingFromSource': 'Missing from source',
  'radar.opportunity.below_target': 'Below target price',
  'radar.opportunity.high_priority_available': 'High priority with copy available',
  'radar.opportunity.available_again': 'Available again',
  'radar.opportunity.already_in_collection': 'Already in your collection',
  'radar.collectionMatch.single': 'View {count} copy in your collection',
  'radar.collectionMatch.multiple': 'View {count} copies in your collection',
} satisfies Record<string, string>;

type RadarReleaseFixture = Pick<RadarRelease, 'id' | 'release_id' | 'title' | 'artist'> & {
  year?: RadarRelease['year'];
  local?: Partial<RadarRelease['local']>;
  source?: Partial<RadarRelease['source']>;
  marketplace?: Partial<RadarRelease['marketplace']>;
  opportunity?: Partial<RadarRelease['opportunity']>;
  display_currency?: RadarRelease['display_currency'];
};

function createRadarRelease(overrides: RadarReleaseFixture): RadarRelease {
  return {
    id: overrides.id,
    user_id: 1,
    release_id: overrides.release_id,
    title: overrides.title,
    artist: overrides.artist,
    year: overrides.year ?? null,
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
      ...overrides.local,
    },
    source: {
      origin: 'discogs',
      status: 'active',
      last_seen_at: '2026-05-10T00:00:00Z',
      ...overrides.source,
    },
    marketplace: {
      status: 'pending',
      estimated_price: null,
      last_checked_at: null,
      ...overrides.marketplace,
    },
    timestamps: {
      created_at: '2026-05-10T00:00:00Z',
      updated_at: '2026-05-10T00:00:00Z',
    },
    opportunity: {
      reasons: [],
      default_visible: true,
      is_in_collection: false,
      collection_match: null,
      ...overrides.opportunity,
    },
    display_currency: overrides.display_currency ?? 'EUR',
  };
}

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const template = messages[key as keyof typeof messages] ?? key;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getRadarRelease,
    updateRadarRelease,
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const originalConfirm = window.confirm;

async function renderRadarDetail(path = '/radar/22') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/radar" element={<div>Radar list</div>} />
          <Route path="/radar/:id" element={<RadarReleaseDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
}

describe('Radar release detail page', () => {
  beforeEach(() => {
    getRadarRelease.mockReset();
    updateRadarRelease.mockReset();
    window.confirm = originalConfirm;
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

  it('loads a Radar release detail page with collection and Discogs navigation plus editable local fields', async () => {
    getRadarRelease.mockResolvedValue(
      createRadarRelease({
        id: 22,
        release_id: 622,
        title: 'Single Match',
        artist: 'Artist B',
        year: 1998,
        local: {
          priority: 'high',
          target_price: 18,
          target_price_eur: 18,
          minimum_condition: 'VG+',
          note: 'Need a cleaner copy',
        },
        source: {
          origin: 'discogs',
          status: 'active',
        },
        marketplace: {
          status: 'priced',
          estimated_price: 16,
          last_checked_at: '2026-05-10T00:00:00Z',
        },
        opportunity: {
          reasons: ['below_target', 'already_in_collection'],
          default_visible: true,
          is_in_collection: true,
          collection_match: {
            primary_release_id: 91,
            copy_count: 1,
          },
        },
      }),
    );

    const rendered = await renderRadarDetail();
    const text = rendered.textContent ?? '';
    const backLink = rendered.querySelector('a[data-radar-detail-back="true"]') as HTMLAnchorElement | null;
    const collectionLink = rendered.querySelector('a[data-radar-collection="22"]') as HTMLAnchorElement | null;
    const discogsLink = rendered.querySelector('a[data-radar-discogs="22"]') as HTMLAnchorElement | null;

    expect(getRadarRelease).toHaveBeenCalledWith('22');
    expect(backLink?.getAttribute('href')).toBe('/radar');
    expect(collectionLink?.getAttribute('href')).toBe('/collection/91');
    expect(discogsLink?.getAttribute('href')).toBe('https://www.discogs.com/release/622');
    expect(text).toContain('Artist B - Single Match');
    expect(text).toContain('#622');
    expect(text).toContain(messages['radar.detailMarketplacePrice']);
    expect(text).toContain(messages['radar.detailSourceOrigin']);
    expect(text).toContain(messages['radar.sourceOrigin.discogs']);
    expect(text).toContain(messages['radar.detailSourceStatus']);
    expect(text).toContain(messages['radar.sourceStatus.active']);
    expect(text).toContain(messages['radar.opportunity.below_target']);
    expect(text).toContain('View 1 copy in your collection');
    expect(text).toContain(messages['radar.priority']);
    expect(text).toContain(messages['radar.note']);
  });

  it('shows a safe not-found state when the Radar id is missing or inaccessible', async () => {
    const error = new Error('Radar release not found') as Error & { status?: number };
    error.status = 404;
    getRadarRelease.mockRejectedValue(error);

    const rendered = await renderRadarDetail('/radar/999');
    const text = rendered.textContent ?? '';
    const backLink = rendered.querySelector('a[data-radar-detail-back="true"]') as HTMLAnchorElement | null;

    expect(text).toContain(messages['radar.detailNotFound']);
    expect(backLink?.getAttribute('href')).toBe('/radar');
  });

  it('marks local decision edits as unsaved and returns to a saved state after an explicit save', async () => {
    const initialRelease = createRadarRelease({
      id: 22,
      release_id: 622,
      title: 'Single Match',
      artist: 'Artist B',
      local: {
        priority: 'normal',
        target_price: 18,
        target_price_eur: 18,
        minimum_condition: 'VG+',
        note: 'Need a cleaner copy',
        hidden: false,
        resolved: false,
      },
    });
    const savedRelease = createRadarRelease({
      id: 22,
      release_id: 622,
      title: 'Single Match',
      artist: 'Artist B',
      local: {
        priority: 'high',
        target_price: 20.5,
        target_price_eur: 20.5,
        minimum_condition: null,
        note: 'Buy after payroll',
        hidden: true,
        resolved: true,
      },
    });

    getRadarRelease.mockResolvedValue(initialRelease);
    updateRadarRelease.mockResolvedValue({
      items: [savedRelease],
      summary: {
        total: 1,
        active: 0,
        hidden: 1,
        resolved: 1,
        missingFromSource: 0,
        priced: 0,
        pending: 1,
        failed: 0,
        unavailable: 0,
      },
    });

    const rendered = await renderRadarDetail();
    const saveButton = rendered.querySelector('button[data-radar-save="22"]') as HTMLButtonElement | null;
    const prioritySelect = rendered.querySelector('select[name="radar-priority-22"]') as HTMLSelectElement | null;
    const targetPriceInput = rendered.querySelector('input[name="radar-target-price-22"]') as HTMLInputElement | null;
    const minimumConditionSelect = rendered.querySelector('select[name="radar-minimum-condition-22"]') as HTMLSelectElement | null;
    const noteInput = rendered.querySelector('textarea[name="radar-note-22"]') as HTMLTextAreaElement | null;
    const hiddenInput = rendered.querySelector('input[name="radar-hidden-22"]') as HTMLInputElement | null;
    const resolvedInput = rendered.querySelector('input[name="radar-resolved-22"]') as HTMLInputElement | null;

    expect(rendered.textContent ?? '').toContain(messages['radar.saveStatus.saved']);
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      if (prioritySelect) {
        prioritySelect.value = 'high';
        prioritySelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (targetPriceInput) {
        targetPriceInput.value = '20.50';
        targetPriceInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (minimumConditionSelect) {
        minimumConditionSelect.value = '';
        minimumConditionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (noteInput) {
        noteInput.value = 'Buy after payroll';
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (hiddenInput) {
        hiddenInput.click();
      }
      if (resolvedInput) {
        resolvedInput.click();
      }
    });

    expect(rendered.textContent ?? '').toContain(messages['radar.saveStatus.unsaved']);
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateRadarRelease).toHaveBeenCalledWith(22, {
      local: {
        priority: 'high',
        target_price: 20.5,
        minimum_condition: null,
        note: 'Buy after payroll',
        hidden: true,
        resolved: true,
      },
    });
    expect(rendered.textContent ?? '').toContain(messages['radar.saveStatus.saved']);
    expect(saveButton?.disabled).toBe(true);
    expect(noteInput?.value).toBe('Buy after payroll');
    expect(hiddenInput?.checked).toBe(true);
    expect(resolvedInput?.checked).toBe(true);
  });

  it('keeps the draft intact after a failed save and allows retrying', async () => {
    const release = createRadarRelease({
      id: 22,
      release_id: 622,
      title: 'Single Match',
      artist: 'Artist B',
    });
    const savedRelease = createRadarRelease({
      id: 22,
      release_id: 622,
      title: 'Single Match',
      artist: 'Artist B',
      local: {
        note: 'Retry this save',
      },
    });

    getRadarRelease.mockResolvedValue(release);
    updateRadarRelease
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({
        items: [savedRelease],
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

    const rendered = await renderRadarDetail();
    const saveButton = rendered.querySelector('button[data-radar-save="22"]') as HTMLButtonElement | null;
    const noteInput = rendered.querySelector('textarea[name="radar-note-22"]') as HTMLTextAreaElement | null;

    await act(async () => {
      if (noteInput) {
        noteInput.value = 'Retry this save';
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.textContent ?? '').toContain(messages['radar.saveStatus.failed']);
    expect(rendered.textContent ?? '').toContain(messages['radar.saveFailed']);
    expect(noteInput?.value).toBe('Retry this save');
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateRadarRelease).toHaveBeenCalledTimes(2);
    expect(rendered.textContent ?? '').toContain(messages['radar.saveStatus.saved']);
    expect(noteInput?.value).toBe('Retry this save');
  });

  it('guards browser unload when unsaved changes exist', async () => {
    getRadarRelease.mockResolvedValue(
      createRadarRelease({
        id: 22,
        release_id: 622,
        title: 'Single Match',
        artist: 'Artist B',
      }),
    );

    const rendered = await renderRadarDetail();
    const noteInput = rendered.querySelector('textarea[name="radar-note-22"]') as HTMLTextAreaElement | null;

    await act(async () => {
      if (noteInput) {
        noteInput.value = 'Do not lose this draft';
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const event = new Event('beforeunload', { cancelable: true }) as Event & { returnValue?: string };
    event.returnValue = undefined;

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(rendered.textContent ?? '').toContain('Do not lose this draft');
  });
});
