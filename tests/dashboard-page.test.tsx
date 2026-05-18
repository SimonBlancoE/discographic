/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard';
import type { DashboardStats } from '../shared/contracts/dashboardStats.js';

const authState = vi.hoisted(() => ({
  accountUnavailable: false,
  discogsConfigured: true,
  currency: 'EUR',
}));

const dashboardStatsState = vi.hoisted(() => ({
  stats: null as DashboardStats | null,
  loading: false,
  error: null,
  refresh: vi.fn(),
}));

const toastError = vi.hoisted(() => vi.fn());

const messages = {
  'dashboard.radarTitle': 'Wantlist',
  'dashboard.radarBody': 'Check the current pulse of your Wantlist without moving the full workflow into the Dashboard.',
  'dashboard.radarOpen': 'Open Wantlist',
  'dashboard.radar.totalWanted': 'Wanted',
  'dashboard.radar.activeOpportunities': 'Active',
  'dashboard.radar.belowTarget': 'High priority',
  'dashboard.radar.alreadyOwned': 'Already owned',
} satisfies Record<string, string>;

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/lib/DashboardStatsContext', () => ({
  useDashboardStats: () => dashboardStatsState,
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => messages[key as keyof typeof messages] ?? key,
  }),
}));

vi.mock('../src/lib/ToastContext', () => ({
  useToast: () => ({
    error: toastError,
  }),
}));

vi.mock('../src/lib/achievements', () => ({
  buildAchievements: () => [],
}));

vi.mock('../src/components/ConfettiBurst', () => ({
  default: () => null,
}));

vi.mock('../src/components/AchievementsPanel', () => ({
  default: () => <div>Achievements</div>,
}));

vi.mock('../src/components/HeroCarousel', () => ({
  default: () => <div>Hero</div>,
}));

vi.mock('../src/components/LoadingSkeletons', () => ({
  DashboardSkeleton: () => <div>Loading</div>,
}));

vi.mock('../src/components/RandomReleaseCard', () => ({
  default: () => <div>Random release</div>,
}));

vi.mock('../src/components/SyncButton', () => ({
  default: () => <button type="button">Sync</button>,
}));

vi.mock('../src/components/charts/StylesChart', () => ({
  default: () => <div>Styles chart</div>,
}));

vi.mock('../src/components/charts/DecadeChart', () => ({
  default: () => <div>Decades chart</div>,
}));

vi.mock('../src/components/charts/FormatChart', () => ({
  default: () => <div>Formats chart</div>,
}));

vi.mock('../src/components/charts/GenreChart', () => ({
  default: () => <div>Genres chart</div>,
}));

vi.mock('../src/components/charts/GrowthChart', () => ({
  default: () => <div>Growth chart</div>,
}));

vi.mock('../src/components/charts/LabelChart', () => ({
  default: () => <div>Labels chart</div>,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderDashboard() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
}

function requireElement<T extends Element>(element: T | null | undefined, description: string) {
  if (!element) {
    throw new Error(`Expected ${description} to exist`);
  }

  return element;
}

describe('Dashboard page', () => {
  beforeEach(() => {
    authState.accountUnavailable = false;
    authState.discogsConfigured = true;
    authState.currency = 'EUR';
    dashboardStatsState.loading = false;
    dashboardStatsState.error = null;
    dashboardStatsState.refresh.mockReset();
    dashboardStatsState.stats = {
      totals: {
        total_records: 20,
        total_value: 90,
        rated_records: 4,
        notes_records: 5,
        priced_records: 6,
        value_pending_records: 1,
        value_failed_records: 0,
        value_unavailable_records: 2,
      },
      genres: [{ name: 'Techno', count: 8 }],
      decades: [{ name: '1990s', count: 7 }],
      formats: [{ name: 'Vinyl', count: 20 }],
      labels: [{ name: 'Warp', count: 3 }],
      styles: [{ name: 'Dub Techno', count: 4 }],
      growth: [{ month: '2026-04', count: 2 }],
      topValue: [],
      artists: [{ artist: 'Basic Channel', count: 2 }],
      radar: {
        totalWanted: 4,
        activeOpportunities: 2,
        belowTarget: 1,
        alreadyOwned: 1,
      },
      lastSync: {
        started_at: '2026-05-10T00:00:00Z',
        finished_at: '2026-05-10T00:01:00Z',
        records_synced: 20,
        status: 'completed',
      },
      displayCurrency: 'EUR',
    };
    toastError.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('shows a compact Wantlist summary with a link to the Wantlist page', async () => {
    const rendered = await renderDashboard();
    const radarLink = requireElement(rendered.querySelector('a[href="/radar"]'), 'Radar link');
    const radarSection = requireElement(radarLink.closest('section'), 'Radar summary section');
    const text = radarSection.textContent ?? '';

    expect(radarLink.textContent).toBe(messages['dashboard.radarOpen']);
    expect(text).toContain(messages['dashboard.radarTitle']);
    expect(text).toContain(messages['dashboard.radar.totalWanted']);
    expect(text).toContain(messages['dashboard.radar.activeOpportunities']);
    expect(text).toContain(messages['dashboard.radar.belowTarget']);
    expect(text).toContain(messages['dashboard.radar.alreadyOwned']);
    expect(text).toContain('4');
    expect(text).toContain('2');
    expect(text).toContain('1');
  });
});
