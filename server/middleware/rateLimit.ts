// Discogs allows 60 requests/minute for authenticated users; retain a safety margin.
const SAFE_RPM = 55;
const WINDOW_MS = 60_000;
const RETRY_AFTER_DEFAULT_MS = 30_000;
const RETRY_AFTER_MAX_MS = 60_000;

type RetryAfterResponse = { headers?: { get?: (header: string) => string | null } | null };
export type DiscogsRateLimiter = (signal?: AbortSignal) => Promise<void>;
type Waiter = { signal?: AbortSignal; resolve: () => void; reject: (reason: unknown) => void; abort: () => void };

export function createDiscogsRateLimiter(): DiscogsRateLimiter {
  const timestamps: number[] = [];
  const queue: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function drain(): void {
    clearTimeout(timer);
    timer = undefined;
    const now = Date.now();
    while (timestamps.length && now - timestamps[0] >= WINDOW_MS) timestamps.shift();
    while (queue.length && timestamps.length < SAFE_RPM) {
      const waiter = queue.shift()!;
      waiter.signal?.removeEventListener('abort', waiter.abort);
      timestamps.push(now);
      waiter.resolve();
    }
    if (queue.length) timer = setTimeout(drain, WINDOW_MS - (now - timestamps[0]) + 200);
  }

  return (signal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const waiter: Waiter = {
      signal, resolve, reject,
      abort() {
        const index = queue.indexOf(waiter);
        if (index < 0) return;
        queue.splice(index, 1);
        signal?.removeEventListener('abort', waiter.abort);
        reject(signal?.reason);
        drain();
      },
    };
    queue.push(waiter);
    signal?.addEventListener('abort', waiter.abort, { once: true });
    drain();
  });
}

/** Bound both delta-seconds and HTTP-date values before they reach a timer. */
export function parseRetryAfter(response: RetryAfterResponse): number {
  const header = response.headers?.get?.('Retry-After');
  if (header?.trim()) {
    const seconds = Number(header);
    const ms = Number.isNaN(seconds) ? Date.parse(header) - Date.now() : seconds * 1000;
    if (!Number.isNaN(ms) && ms >= 0) return Math.min(ms, RETRY_AFTER_MAX_MS);
  }
  return RETRY_AFTER_DEFAULT_MS;
}
