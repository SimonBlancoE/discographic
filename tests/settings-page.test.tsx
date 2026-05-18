/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../src/pages/Settings';

const authState = vi.hoisted(() => ({
  logout: vi.fn(),
  refreshAccount: vi.fn(),
  isAdmin: false,
}));

const refreshDashboardStats = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const getAccount = vi.hoisted(() => vi.fn());
const updateAccount = vi.hoisted(() => vi.fn());
const resetCollection = vi.hoisted(() => vi.fn());
const changePassword = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/lib/DashboardStatsContext', () => ({
  useDashboardStats: () => ({
    refresh: refreshDashboardStats,
  }),
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../src/lib/ToastContext', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getAccount,
    updateAccount,
    resetCollection,
    changePassword,
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSettings() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <Settings />
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

function getInputByLabel(rendered: HTMLElement, labelText: string) {
  const label = Array.from(rendered.querySelectorAll('label')).find((nextLabel) =>
    nextLabel.textContent?.includes(labelText),
  );

  return requireElement(label?.querySelector('input'), `${labelText} input`);
}

function getButtonByText(rendered: HTMLElement, buttonText: string) {
  const button = Array.from(rendered.querySelectorAll('button')).find(
    (nextButton) => nextButton.textContent === buttonText,
  );

  return requireElement(button, `${buttonText} button`);
}

describe('Settings page', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    authState.logout.mockReset();
    authState.refreshAccount.mockReset();
    authState.refreshAccount.mockResolvedValue(undefined);
    authState.isAdmin = false;
    refreshDashboardStats.mockReset();
    refreshDashboardStats.mockResolvedValue(null);
    toastSuccess.mockReset();
    toastError.mockReset();
    getAccount.mockReset();
    getAccount.mockResolvedValue({
      discogsUsername: 'miles',
      tokenConfigured: true,
      tokenPreview: 'abcd...wxyz',
      currency: 'EUR',
    });
    updateAccount.mockReset();
    updateAccount.mockResolvedValue({
      discogsUsername: 'sonny',
      tokenConfigured: true,
      tokenPreview: 'abcd...wxyz',
      currency: 'EUR',
      cacheReset: true,
      message: 'backend.account.updatedReset',
    });
    resetCollection.mockReset();
    resetCollection.mockResolvedValue({
      ok: true,
      message: 'backend.account.reset',
    });
    changePassword.mockReset();
    changePassword.mockResolvedValue({
      ok: true,
      message: 'settings.passwordSaved',
    });
    window.confirm = vi.fn(() => true);
  });

  afterEach(async () => {
    window.confirm = originalConfirm;
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('refreshes account and dashboard state after saving a changed Discogs account', async () => {
    const rendered = await renderSettings();
    const usernameInput = getInputByLabel(rendered, 'settings.discogsUser');
    const accountForm = requireElement(usernameInput.closest('form'), 'account form');

    await act(async () => {
      usernameInput.value = 'sonny';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      accountForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateAccount).toHaveBeenCalledTimes(1);
    expect(authState.refreshAccount).toHaveBeenCalledTimes(1);
    expect(refreshDashboardStats).toHaveBeenCalledTimes(1);
  });

  it('masks the Discogs token input', async () => {
    const rendered = await renderSettings();
    const tokenInput = getInputByLabel(rendered, 'settings.newTokenOptional');

    expect(tokenInput.getAttribute('type')).toBe('password');
  });

  it('refreshes account and dashboard state after resetting local data', async () => {
    const rendered = await renderSettings();
    const resetButton = getButtonByText(rendered, 'settings.reset');

    await act(async () => {
      resetButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resetCollection).toHaveBeenCalledTimes(1);
    expect(authState.refreshAccount).toHaveBeenCalledTimes(1);
    expect(refreshDashboardStats).toHaveBeenCalledTimes(1);
  });
});
