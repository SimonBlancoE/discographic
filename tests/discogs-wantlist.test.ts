import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscogsClient } from '../server/discogs.js';

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
      .mockResolvedValueOnce(jsonResponse({
        pagination: {
          page: 1,
          pages: 2,
          items: 3,
        },
        wants: [{ id: 101 }, { id: 102 }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        pagination: {
          page: 2,
          pages: 2,
          items: 3,
        },
        wants: [{ id: 103 }],
      }));

    const discogs = createDiscogsClient({
      token: 'discogs-token',
      username: 'collector',
    });

    await expect(discogs.getAllWantlist()).resolves.toEqual([
      { id: 101 },
      { id: 102 },
      { id: 103 },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/users/collector/wants?page=1&per_page=100&sort=added&sort_order=desc');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/users/collector/wants?page=2&per_page=100&sort=added&sort_order=desc');
  });
});
