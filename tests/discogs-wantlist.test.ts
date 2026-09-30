import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscogsClient } from '../server/discogs.js';
import { wantlistEntry, wantlistPage } from './fixtures/discogsWantlist.js';

const originalFetch = global.fetch;

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('Discogs wantlist client', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('fetches every page of the configured user wantlist', async () => {
    const fetchMock = vi.mocked(global.fetch);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(wantlistPage([101, 102], 1, 2, 3)))
      .mockResolvedValueOnce(jsonResponse(wantlistPage([103], 2, 2, 3)));

    const discogs = createDiscogsClient({
      token: 'discogs-token',
      username: 'collector',
    });

    await expect(discogs.getAllWantlist(2)).resolves.toEqual([101, 102, 103].map(wantlistEntry));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/users/collector/wants?page=1&per_page=2&sort=added&sort_order=desc');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/users/collector/wants?page=2&per_page=2&sort=added&sort_order=desc');
  });

  it.each([
    ['missing envelope', {}],
    ['null envelope', null],
    ['missing pagination', { wants: [] }],
    ['missing wants', { pagination: wantlistPage([]).pagination }],
    ['invalid wants', { ...wantlistPage([]), wants: {} }],
    ['missing items', { ...wantlistPage([]), pagination: { page: 1, per_page: 100, pages: 0 } }],
    ['negative items', { ...wantlistPage([]), pagination: { page: 1, per_page: 100, pages: 0, items: -1 } }],
    ['fractional items', { ...wantlistPage([]), pagination: { page: 1, per_page: 100, pages: 1, items: 0.5 } }],
    ['string items', { ...wantlistPage([]), pagination: { page: 1, per_page: 100, pages: 0, items: '0' } }],
    ['missing page', { ...wantlistPage([]), pagination: { per_page: 100, pages: 0, items: 0 } }],
    ['wrong page', wantlistPage([101], 2)],
    ['missing per_page', { ...wantlistPage([101]), pagination: { page: 1, pages: 1, items: 1 } }],
    ['wrong per_page', wantlistPage([101], 1, 2)],
    ['zero per_page', wantlistPage([], 1, 0, 0, 0)],
    ['invalid pages', wantlistPage([101], 1, 100, 1, 0)],
    ['inflated pages', wantlistPage([101], 1, 100, 1, 2)],
    ['short page', wantlistPage([101], 1, 100, 2)],
    ['extra row', wantlistPage([101, 102], 1, 100, 1)],
    ['duplicate identity', wantlistPage([101, 101])],
    ['missing identity', { ...wantlistPage([101]), wants: [{}] }],
    ['zero identity', wantlistPage([0])],
    ['negative identity', wantlistPage([-101])],
    ['fractional identity', wantlistPage([101.5])],
    ['unsafe identity', wantlistPage([Number.MAX_SAFE_INTEGER + 1])],
    ['conflicting identity', { ...wantlistPage([101]), wants: [{ ...wantlistEntry(101), basic_information: { id: 102 } }] }],
    ['string identity', { ...wantlistPage([101]), wants: [{ id: '101' }] }],
  ])('rejects %s instead of returning a destructive snapshot', async (_name, payload) => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse(payload));
    const discogs = createDiscogsClient({ token: 'fixture-token', username: 'collector' });
    await expect(discogs.getAllWantlist()).rejects.toThrow(/wantlist/i);
  });

  it.each([
    ['missing page', null],
    ['empty page', wantlistPage([], 2, 2, 3)],
    ['duplicate from earlier page', wantlistPage([101], 2, 2, 3)],
    ['wrong page number', wantlistPage([103], 1, 2, 3)],
    ['changed items', wantlistPage([103], 2, 2, 4)],
    ['changed pages', wantlistPage([103], 2, 2, 3, 3)],
    ['changed per_page', wantlistPage([103], 2, 3, 3)],
  ])('rejects a traversal with %s', async (_name, payload) => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse(wantlistPage([101, 102], 1, 2, 3)))
      .mockResolvedValueOnce(jsonResponse(payload));
    const discogs = createDiscogsClient({ token: 'fixture-token', username: 'collector' });
    await expect(discogs.getAllWantlist(2)).rejects.toThrow(/wantlist/i);
  });

  it.each([0, 1])('accepts an explicit empty snapshot with %i pages', async (pages) => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse(wantlistPage([], 1, 100, 0, pages)));
    const discogs = createDiscogsClient({ token: 'fixture-token', username: 'collector' });
    await expect(discogs.getAllWantlist()).resolves.toEqual([]);
  });
});
