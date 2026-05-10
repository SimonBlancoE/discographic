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
});
