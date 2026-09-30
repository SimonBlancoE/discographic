import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { createDiscogsClient } from '../server/discogs.js';
import { createDiscogsRateLimiter, parseRetryAfter } from '../server/middleware/rateLimit.js';
import { cancelUserJobs, createUserJobScope } from '../server/services/userJobs.js';

const account = { token: 'fixture-token', username: 'collector' };
function json() { return Response.json({ ok: true }); }
function neverFetch() {
  return vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  }));
}
function client(limits = { deadlineMs: 100, attemptTimeoutMs: 30 }) {
  return createDiscogsClient({ ...account, ...limits, waitTurn: createDiscogsRateLimiter() });
}

describe('Discogs application deadlines', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('bounds a never resolving upstream attempt and aborts the transport', async () => {
    const fetchMock = neverFetch();
    vi.stubGlobal('fetch', fetchMock);
    const result = client().getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(30);
    expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a caller signal, including an already aborted caller', async () => {
    const caller = new AbortController();
    caller.abort();
    await expect(client().request('/releases/12', { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['client', 'request'] as const)('contextualizes a caller TimeoutError from the %s signal and retains its cause', async source => {
    const caller = new AbortController();
    const reason = new DOMException('Caller budget expired', 'TimeoutError');
    caller.abort(reason);
    const discogs = createDiscogsClient({ ...account, signal: source === 'client' ? caller.signal : undefined });
    const result = await discogs.getRelease(12, source === 'request' ? { signal: caller.signal } : {}).catch(error => error);
    expect(result).toMatchObject({ name: 'TimeoutError', message: expect.stringContaining('GET /releases/12'), cause: reason });
    expect(result instanceof Error && result.cause).toBe(reason);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('contextualizes a native AbortSignal.timeout during transport', async () => {
    // Node's native timeout signal uses internal timers, outside Vitest's fake clock.
    // Await its event through the client; do not assert elapsed wall-clock time.
    vi.useRealTimers();
    const caller = AbortSignal.timeout(0);
    vi.stubGlobal('fetch', neverFetch());
    const result = await createDiscogsClient(account).getRelease(12, { signal: caller }).catch(error => error);
    expect(result).toMatchObject({ name: 'TimeoutError', message: expect.stringContaining('GET /releases/12') });
    expect(result instanceof Error && result.cause).toBe(caller.reason);
  });

  it.each(['application/json', 'text/plain'])('keeps its timeout through the %s body read', async contentType => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: contentType === 'text/plain' ? 500 : 200,
      headers: { 'content-type': contentType },
    });
    vi.mocked(fetch).mockResolvedValue(response);
    const result = client().getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(30);
    expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({ name: 'TimeoutError' });
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes 429 bodies before retrying and supports successful retries', async () => {
    const cancelled = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelled }), { status: 429, headers: { 'Retry-After': '0.01' } }))
      .mockResolvedValueOnce(json());
    const result = client().getRelease(12);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ ok: true });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels backoff promptly without another attempt', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
    const caller = new AbortController();
    const result = client().request('/releases/12', { signal: caller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(1);
    caller.abort();
    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getEventListeners(caller.signal, 'abort')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the overall deadline to Retry-After waits', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '999999999' } }));
    const result = client().getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({ name: 'TimeoutError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry an ambiguous failed write', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('connection lost'));
    await expect(client().updateRating({ releaseId: 1, instanceId: 2, rating: 5 })).rejects.toThrow('connection lost');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds Retry-After including overflowing numeric and distant date headers', () => {
    for (const value of ['99999999999', '1e300', 'Wed, 31 Dec 2098 23:59:59 GMT']) {
      expect(parseRetryAfter(new Response(null, { headers: { 'Retry-After': value } }))).toBeLessThanOrEqual(60_000);
    }
  });

  it('rejects quota waiters promptly on cancellation and lets later clients proceed', async () => {
    const waitTurn = createDiscogsRateLimiter();
    for (let i = 0; i < 55; i++) await waitTurn();
    const first = new AbortController();
    const second = new AbortController();
    const waiting = waitTurn(first.signal).catch(error => error);
    const behind = waitTurn(second.signal).catch(error => error);
    second.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await Promise.race([behind, Promise.resolve('still pending')])).toMatchObject({ name: 'AbortError' });
    first.abort();
    await expect(waiting).resolves.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    const survivor = waitTurn();
    await vi.advanceTimersByTimeAsync(60_200);
    await expect(survivor).resolves.toBeUndefined();
    expect(getEventListeners(first.signal, 'abort')).toHaveLength(0);
    expect(getEventListeners(second.signal, 'abort')).toHaveLength(0);
  });

  it('bounds the whole operation while queued, before dispatching fetch', async () => {
    const waitTurn = createDiscogsRateLimiter();
    for (let i = 0; i < 55; i++) await waitTurn();
    const discogs = createDiscogsClient({ ...account, deadlineMs: 100, attemptTimeoutMs: 30, waitTurn });
    const result = discogs.getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({ name: 'TimeoutError' });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows the normal exhausted quota window within the default total deadline', async () => {
    const waitTurn = createDiscogsRateLimiter();
    for (let i = 0; i < 55; i++) await waitTurn();
    vi.mocked(fetch).mockResolvedValue(json());
    const result = createDiscogsClient({ ...account, waitTurn }).getRelease(12);
    await vi.advanceTimersByTimeAsync(60_200);
    await expect(result).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates job stop and account reset without affecting a replacement scope', async () => {
    vi.stubGlobal('fetch', neverFetch());
    const first = createUserJobScope(876);
    const second = createUserJobScope(876);
    const discogs = createDiscogsClient({ ...account, signal: first.signal });
    const result = discogs.getRelease(1).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    first.cancel();
    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
    expect(second.signal.aborted).toBe(false);
    cancelUserJobs(876);
    expect(second.signal.aborted).toBe(true);
    const replacement = createUserJobScope(876);
    first.cancel();
    expect(replacement.signal.aborted).toBe(false);
    expect(second.stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an active response body and preserves contextual abort errors', async () => {
    const cancelled = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ cancel: cancelled }), {
      headers: { 'content-type': 'application/json' },
    }));
    const caller = new AbortController();
    const result = client().getRelease(12, { signal: caller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    caller.abort(new Error('caller stopped'));
    await expect(result).resolves.toMatchObject({ name: 'AbortError', message: expect.stringContaining('GET /releases/12') });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes every exhausted 429 response and stops at the explicit retry cap', async () => {
    const cancelled = vi.fn();
    vi.mocked(fetch).mockImplementation(async () => new Response(new ReadableStream({ cancel: cancelled }), {
      status: 429, headers: { 'Retry-After': '0.001' },
    }));
    const result = client().getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toMatchObject({ message: expect.stringContaining('retries exhausted') });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(cancelled).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one total deadline across retries and body reads', async () => {
    const cancelled = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '0.02' } }))
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'content-type': 'application/json' } }));
    const result = client({ deadlineMs: 40, attemptTimeoutMs: 30 }).getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(40);
    await expect(result).resolves.toMatchObject({ name: 'TimeoutError', message: expect.stringContaining('application deadline') });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 204])('preserves empty/non-JSON %i success and disposes unread bodies', async status => {
    const cancelled = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response(status === 204 ? null : new ReadableStream({ cancel: cancelled }), {
      status, headers: { 'content-type': 'text/plain' },
    }));
    await expect(client().getRelease(12)).resolves.toBeNull();
    expect(cancelled).toHaveBeenCalledTimes(status === 204 ? 0 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no owned listeners or timers after repeated successful transient scopes', async () => {
    vi.mocked(fetch).mockImplementation(async () => json());
    const waitTurn = createDiscogsRateLimiter();
    const scopes = Array.from({ length: 40 }, () => createUserJobScope(988));
    for (const scope of scopes) {
      await createDiscogsClient({ ...account, waitTurn, signal: scope.signal }).getRelease(12);
      expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
    }
    expect(vi.getTimerCount()).toBe(0);
    cancelUserJobs(988);
    expect(scopes.every(scope => scope.stopped && scope.signal.aborted)).toBe(true);
    expect(createUserJobScope(988).stopped).toBe(false);
  });

  it('preserves authentication, request headers and write payloads', async () => {
    vi.mocked(fetch).mockResolvedValue(json());
    await client().updateRating({ releaseId: 12, instanceId: 23, rating: 5 });
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(new Headers(init.headers).get('authorization')).toBe('Discogs token=fixture-token');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"rating":5}');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('bounds stalled 429 resource disposal without starting another attempt', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 429 }));
    const result = client().getRelease(12).catch(error => error);
    await vi.advanceTimersByTimeAsync(30);
    await expect(result).resolves.toMatchObject({ name: 'TimeoutError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, Infinity, NaN, 2_147_483_648])('rejects invalid deadlines: %s', value => {
    expect(() => client({ deadlineMs: value, attemptTimeoutMs: 30 })).toThrow(RangeError);
    expect(() => client({ deadlineMs: 100, attemptTimeoutMs: value })).toThrow(RangeError);
  });

});
