import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Radar from '../src/pages/Radar';

const authState = vi.hoisted(() => ({
  accountUnavailable: false,
  capabilities: {
    canUseRadar: false
  }
}));

const messages = {
  'radar.blockedTitle': 'Connect your Discogs account',
  'radar.blockedBody': 'Radar needs a configured Discogs account before it can show your buying workspace.',
  'radar.openSettings': 'Open Settings',
  'radar.emptyEyebrow': 'Radar',
  'radar.emptyTitle': 'Your Radar is ready',
  'radar.emptyBody': 'Wantlist data will appear here in the next slice.',
  'radar.accountUnavailable': 'Discogs account status could not be loaded. Reload the page or review Settings before opening Radar.'
} satisfies Record<string, string>;

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key as keyof typeof messages] ?? key
  })
}));

function renderRadar() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Radar />
    </MemoryRouter>
  );
}

describe('Radar page', () => {
  beforeEach(() => {
    authState.accountUnavailable = false;
    authState.capabilities.canUseRadar = false;
  });

  it('shows a blocked state with a Settings link when the Discogs account is not configured', () => {
    const html = renderRadar();

    expect(html).toContain(messages['radar.blockedTitle']);
    expect(html).toContain(messages['radar.blockedBody']);
    expect(html).toContain('href="/settings"');
    expect(html).toContain(messages['radar.openSettings']);
  });

  it('shows an empty Radar workspace when the Discogs account is configured', () => {
    authState.capabilities.canUseRadar = true;

    const html = renderRadar();

    expect(html).toContain(messages['radar.emptyEyebrow']);
    expect(html).toContain(messages['radar.emptyTitle']);
    expect(html).toContain(messages['radar.emptyBody']);
    expect(html).not.toContain('href="/settings"');
  });

  it('shows the account-unavailable state before the blocked state when account status cannot be loaded', () => {
    authState.accountUnavailable = true;

    const html = renderRadar();

    expect(html).toContain(messages['radar.accountUnavailable']);
    expect(html).not.toContain(messages['radar.blockedTitle']);
  });
});
