import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api.js';

describe('api query string serialization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('omits nullish query params while preserving false, zero, and empty string values', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.fetchTapeteBlob(0, {
      search: '',
      genre: undefined,
      style: false,
      decade: null,
      format: 'Vinyl',
    } as unknown as Parameters<typeof api.fetchTapeteBlob>[1]);

    const [url] = fetchMock.mock.calls[0] ?? [undefined];
    const params = new URL(String(url), 'https://discographic.test').searchParams;

    expect(params.has('genre')).toBe(false);
    expect(params.has('decade')).toBe(false);
    expect(params.get('maxSize')).toBe('0');
    expect(params.get('search')).toBe('');
    expect(params.get('style')).toBe('false');
    expect(params.get('format')).toBe('Vinyl');
  });
});
