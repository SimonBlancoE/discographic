// Discogs allows 60 requests/minute for authenticated users.
// We stay conservative at 55 to avoid edge-case 429s.
const SAFE_RPM = 55;
const WINDOW_MS = 60_000;
const RETRY_AFTER_DEFAULT_MS = 30_000;

export function createDiscogsRateLimiter() {
  const timestamps = []; // ring buffer of request timestamps

  return async function waitTurn() {
    const now = Date.now();

    // Purge entries older than the window
    while (timestamps.length > 0 && now - timestamps[0] >= WINDOW_MS) {
      timestamps.shift();
    }

    if (timestamps.length >= SAFE_RPM) {
      // Wait until the oldest request in the window expires
      const oldest = timestamps[0];
      const waitMs = WINDOW_MS - (now - oldest) + 200; // +200ms safety margin
      console.log(`[rate-limit] cuota llena, esperando ${(waitMs / 1000).toFixed(1)}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      // Purge again after sleeping
      const after = Date.now();
      while (timestamps.length > 0 && after - timestamps[0] >= WINDOW_MS) {
        timestamps.shift();
      }
    }

    timestamps.push(Date.now());
  };
}

/**
 * Parse a Discogs 429 response and return how many ms to wait.
 * Falls back to RETRY_AFTER_DEFAULT_MS if no header is present.
 */
export function parseRetryAfter(response) {
  const header = response.headers?.get?.('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return RETRY_AFTER_DEFAULT_MS;
}
