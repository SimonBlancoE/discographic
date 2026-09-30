import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { cancelUserJobs, createUserJobScope } from '../server/services/userJobs.js';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-cover-deadlines-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { fetchRemoteImage, ensureCachedCover, generateTapeteImage } = await import('../server/services/coverMedia.js');
const url = 'https://i.discogs.com/fixture.jpg';
let source: Buffer;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function image() { return new Response(new Uint8Array(source), { headers: { 'content-type': 'image/png' } }); }
async function settled<T>(promise: Promise<T>) { return Promise.race([promise, Promise.resolve('still pending')]); }
beforeAll(async () => {
  source = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
afterAll(() => { vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true }); });

it('bounds held fetch with the default 30-second deadline and aborts transport without retry', async () => {
  vi.useFakeTimers();
  const transport = vi.fn<typeof fetch>(() => new Promise(() => {})); vi.stubGlobal('fetch', transport);
  const result = fetchRemoteImage(url).catch(error => error);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(await settled(result)).toBe('still pending');
  await vi.advanceTimersByTimeAsync(1);
  expect(await settled(result)).toMatchObject({ name: 'TimeoutError' });
  expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it('keeps one injectable deadline across fetch and the entire stalled body', async () => {
  vi.useFakeTimers();
  const upstream = deferred<Response>(); let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  vi.stubGlobal('fetch', () => upstream.promise);
  const result = fetchRemoteImage(url, { deadlineMs: 50 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(40); upstream.resolve(response);
  await vi.advanceTimersByTimeAsync(10);
  expect(await settled(result)).toMatchObject({ name: 'TimeoutError' });
  expect(cancelled).toBe(true); expect(response.body?.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});

it('cancels promptly while fetch ignores abort and disposes its late unread response', async () => {
  vi.useFakeTimers();
  const scope = createUserJobScope(910); const upstream = deferred<Response>(); let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const read = vi.spyOn(response.body!, 'getReader');
  vi.stubGlobal('fetch', () => upstream.promise);
  const result = fetchRemoteImage(url, { signal: scope.signal }).catch(error => error);
  scope.cancel(); await vi.advanceTimersByTimeAsync(0);
  expect(await settled(result)).toMatchObject({ name: 'AbortError' });
  expect(vi.getTimerCount()).toBe(0); expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
  upstream.resolve(response); await vi.advanceTimersByTimeAsync(0);
  expect(cancelled).toBe(true); expect(read).not.toHaveBeenCalled();
});

it('disposes an unread response when cancellation wins after transport settlement', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const controller = new AbortController(); const upstream = deferred<Response>(); let cancelled = 0;
  const response = new Response(new ReadableStream({ cancel() { cancelled += 1; } }));
  const read = vi.spyOn(response.body!, 'getReader');
  vi.stubGlobal('fetch', () => upstream.promise);
  const result = fetchRemoteImage(url, { signal: controller.signal }).catch(error => error);
  upstream.resolve(response);
  // The transport callback runs first, then abort wins before withAbort delivers it.
  queueMicrotask(() => controller.abort());
  expect(await result).toMatchObject({ name: 'AbortError' });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(cancelled).toBe(1); expect(read).not.toHaveBeenCalled();
  expect(response.body?.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});

it('does not dispatch already cancelled downloads', async () => {
  vi.useFakeTimers(); const scope = createUserJobScope(911); scope.cancel();
  const transport = vi.fn<typeof fetch>(async () => image()); vi.stubGlobal('fetch', transport);
  await expect(fetchRemoteImage(url, { signal: scope.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it('disposes HTTP error bodies even when upstream disposal stalls', async () => {
  vi.useFakeTimers(); let cancelled = false;
  vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { status: 503 }));
  const result = fetchRemoteImage(url, { deadlineMs: 20 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(20);
  expect(await settled(result)).toBeInstanceOf(Error); expect(cancelled).toBe(true); expect(vi.getTimerCount()).toBe(0);
});

it('cleans body ownership and deadline after a body failure', async () => {
  vi.useFakeTimers(); const failure = new Error('broken body');
  const response = new Response(new ReadableStream({ start(controller) { controller.error(failure); } }));
  vi.stubGlobal('fetch', async () => response);
  await expect(fetchRemoteImage(url)).rejects.toThrow('broken body');
  expect(response.body?.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});

it('preserves successful bytes, content type, and user agent while releasing resources', async () => {
  vi.useFakeTimers(); const scope = createUserJobScope(912); const response = image();
  const transport = vi.fn<typeof fetch>(async () => response); vi.stubGlobal('fetch', transport);
  await expect(fetchRemoteImage(url, { signal: scope.signal })).resolves.toEqual({ contentType: 'image/png', buffer: source });
  expect(new Headers(transport.mock.calls[0][1]?.headers).get('user-agent')).toBe('Discographic/1.0');
  expect(response.body?.locked).toBe(false); expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
});

it.each(['stop', 'reset'] as const)('aborts a cached cover on %s and lets a fresh scope cache without stale files', async mode => {
  const userId = mode === 'stop' ? 913 : 914; const scope = createUserJobScope(userId);
  const upstream = deferred<Response>(); let entered = false; let cancelled = false;
  vi.stubGlobal('fetch', () => { entered = true; return upstream.promise; });
  const release = { id: 77, cover_url: url };
  const result = ensureCachedCover({ release, userId, variant: 'wall', scope }).catch(error => error);
  await vi.waitFor(() => expect(entered).toBe(true));
  if (mode === 'stop') scope.cancel(); else cancelUserJobs(userId);
  let outcome: unknown; void result.then(value => { outcome = value; });
  await vi.waitFor(() => expect(outcome).toBeInstanceOf(Error));
  expect(existsSync(join(dataDir, 'covers', String(userId), '77-wall.jpg'))).toBe(false);
  const fresh = createUserJobScope(userId); vi.stubGlobal('fetch', async () => image());
  const path = await ensureCachedCover({ release, userId, variant: 'wall', scope: fresh });
  upstream.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await vi.waitFor(() => expect(cancelled).toBe(true));
  expect(fresh.stopped).toBe(false); expect(existsSync(path)).toBe(true);
  expect(readdirSync(join(dataDir, 'covers', String(userId)))).toEqual(['77-wall.jpg']);
  expect((await sharp(path).metadata()).format).toBe('jpeg');
});

it('account reset releases a stalled tapete body and prevents stale tiles', async () => {
  let entered = false; let cancelled = false;
  vi.stubGlobal('fetch', async () => { entered = true; return new Response(new ReadableStream({ cancel() { cancelled = true; } })); });
  const result = generateTapeteImage({ releases: [{ id: 88, cover_url: url }], userId: 915, maxSize: 1000 }).catch(error => error);
  await vi.waitFor(() => expect(entered).toBe(true)); cancelUserJobs(915);
  let outcome: unknown; void result.then(value => { outcome = value; });
  await vi.waitFor(() => expect(outcome).toMatchObject({ name: 'AbortError' }));
  expect(cancelled).toBe(true); expect(readdirSync(join(dataDir, 'covers', '915'))).toEqual([]);
});

it.each([0, -1, Infinity, NaN, 2_147_483_648])('rejects invalid cover deadlines %s before dispatch', async deadlineMs => {
  const transport = vi.fn<typeof fetch>(async () => image()); vi.stubGlobal('fetch', transport);
  await expect(fetchRemoteImage(url, { deadlineMs })).rejects.toBeInstanceOf(RangeError);
  expect(transport).not.toHaveBeenCalled();
});
