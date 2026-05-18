/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyncButton from '../src/components/SyncButton';
import { api } from '../src/lib/api';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const translate = vi.hoisted(() => (key: string, vars?: Record<string, string | number>) => {
  if (key === 'sync.statusError') {
    return `Sync status unavailable: ${vars?.error}`;
  }

  if (key === 'sync.retryStatus') {
    return 'Retry status';
  }

  if (key === 'client.networkError') {
    return 'Network error';
  }

  return key;
});
const i18n = vi.hoisted(() => ({
  locale: 'en',
  t: translate,
}));
const toast = vi.hoisted(() => ({
  success: toastSuccess,
  error: toastError,
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getSyncStatus: vi.fn(),
    startSync: vi.fn(),
    enrichValues: vi.fn(),
    stopEnrich: vi.fn(),
  },
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => i18n,
}));

vi.mock('../src/lib/ToastContext', () => ({
  useToast: () => toast,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSyncButton() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<SyncButton />);
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
}

function textContent() {
  return container?.textContent || '';
}

function requireButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') || [])
    .find((candidate) => candidate.textContent === label);

  if (!button) {
    throw new Error(`Expected button "${label}" to exist`);
  }

  return button;
}

describe('SyncButton', () => {
  beforeEach(() => {
    vi.mocked(api.getSyncStatus).mockReset();
    vi.mocked(api.startSync).mockReset();
    vi.mocked(api.enrichValues).mockReset();
    vi.mocked(api.stopEnrich).mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('keeps an initial status-load failure visible and retryable after a failed retry', async () => {
    vi.mocked(api.getSyncStatus)
      .mockRejectedValueOnce(new Error('Initial status failed'))
      .mockRejectedValueOnce(new Error('Retry status failed'));

    await renderSyncButton();

    expect(textContent()).toContain('Sync status unavailable: Initial status failed');
    const retryButton = requireButton('Retry status');

    await act(async () => {
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.getSyncStatus).toHaveBeenCalledTimes(2);
    expect(textContent()).toContain('Sync status unavailable: Retry status failed');
    expect(requireButton('Retry status')).toBeInstanceOf(HTMLButtonElement);
  });
});
