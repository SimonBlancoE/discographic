/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Collection from '../src/pages/Collection';
import type { CollectionPageResponse } from '../src/lib/types';
import type { CollectionRelease } from '../shared/contracts/release.js';

const authState = vi.hoisted(() => ({
  accountUnavailable: false,
  discogsConfigured: true,
  currency: 'EUR',
  setCurrencyPreference: vi.fn(),
}));

const getCollection = vi.hoisted(() => vi.fn());
const getPreference = vi.hoisted(() => vi.fn());
const setPreference = vi.hoisted(() => vi.fn());
const updateRelease = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/lib/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'collection.results') {
        return `${values?.count ?? 0} results`;
      }
      if (key === 'collection.activeFilters') {
        return `${values?.count ?? 0} filters`;
      }
      if (key === 'collection.page') {
        return `Page ${values?.page ?? 1} of ${values?.total ?? 1}`;
      }
      return key;
    },
  }),
}));

vi.mock('../src/lib/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../src/lib/api', () => ({
  api: {
    getCollection,
    getPreference,
    setPreference,
    updateRelease,
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createRelease(overrides: Partial<CollectionRelease>): CollectionRelease {
  return {
    id: overrides.id ?? 1,
    user_id: 1,
    release_id: overrides.release_id ?? overrides.id ?? 1,
    instance_id: overrides.instance_id ?? overrides.id ?? 1,
    title: overrides.title ?? 'Test Release',
    artist: overrides.artist ?? 'Test Artist',
    year: overrides.year ?? 2026,
    genres: [],
    styles: [],
    formats: [],
    labels: [],
    country: null,
    cover_url: null,
    rating: 0,
    notes: [],
    notes_text: '',
    date_added: null,
    estimated_value: null,
    marketplace_status: 'pending',
    listing_status: null,
    listing_price: null,
    listing_currency: null,
    listing_price_eur: null,
    folder_id: 0,
    synced_at: null,
    display_currency: overrides.display_currency ?? null,
    ...overrides,
  };
}

function createCollectionResponse(
  title: string,
  page: number,
  displayCurrency: CollectionPageResponse['displayCurrency'],
): CollectionPageResponse {
  return {
    releases: [createRelease({ id: page, title, display_currency: displayCurrency })],
    displayCurrency,
    pagination: {
      page,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
    filters: {
      genres: [],
      styles: [],
      decades: [],
      formats: [],
      labels: [],
    },
  };
}

async function renderCollection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <Collection />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });

  return container;
}

function getCurrencySelect(rendered: HTMLDivElement): HTMLSelectElement {
  const select = rendered.querySelector('select') as HTMLSelectElement | null;

  if (!select) {
    throw new Error('Missing collection currency select');
  }

  return select;
}

async function changeCurrency(rendered: HTMLDivElement, value: string) {
  const select = getCurrencySelect(rendered);
  select.value = value;

  await act(async () => {
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Collection page', () => {
  beforeEach(() => {
    authState.accountUnavailable = false;
    authState.discogsConfigured = true;
    authState.currency = 'EUR';
    authState.setCurrencyPreference.mockReset();
    authState.setCurrencyPreference.mockResolvedValue('EUR');
    getCollection.mockReset();
    getPreference.mockReset();
    setPreference.mockReset();
    updateRelease.mockReset();
    getPreference.mockResolvedValue({ value: null });
    setPreference.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('keeps stale collection loads from replacing the latest response', async () => {
    const usdLoad = createDeferred<CollectionPageResponse>();
    const gbpLoad = createDeferred<CollectionPageResponse>();

    getCollection
      .mockResolvedValueOnce(createCollectionResponse('Initial collection', 1, 'EUR'))
      .mockReturnValueOnce(usdLoad.promise)
      .mockReturnValueOnce(gbpLoad.promise);

    const rendered = await renderCollection();

    await act(async () => {
      await Promise.resolve();
    });

    await changeCurrency(rendered, 'USD');
    await changeCurrency(rendered, 'GBP');

    await act(async () => {
      gbpLoad.resolve(createCollectionResponse('Newest GBP collection', 2, 'GBP'));
      await gbpLoad.promise;
    });

    expect(rendered.textContent ?? '').toContain('Newest GBP collection');

    await act(async () => {
      usdLoad.resolve(createCollectionResponse('Stale USD collection', 3, 'USD'));
      await usdLoad.promise;
    });

    const text = rendered.textContent ?? '';
    expect(text).toContain('Newest GBP collection');
    expect(text).not.toContain('Stale USD collection');
    expect(text).toContain('Page 2 of 1');
  });
});
