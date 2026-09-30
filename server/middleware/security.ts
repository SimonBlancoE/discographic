import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

// Placeholder values shipped in docker-compose.yml / .env.example / older code. Signing cookies with a
// publicly known secret lets anyone forge a session cookie, so they are treated as "not configured".
const PLACEHOLDER_SECRETS = new Set(['discographic-dev-secret', 'change-this-in-production']);
const SECRET_FILE = '.session-secret';

/**
 * Uses SESSION_SECRET when it is a real secret; otherwise generates one once and keeps it in the data
 * volume so sessions survive restarts without the operator having to configure anything.
 */
export function resolveSessionSecret(dataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SESSION_SECRET?.trim();
  if (configured && !PLACEHOLDER_SECRETS.has(configured)) {
    return configured;
  }

  const secretPath = join(dataDir, SECRET_FILE);
  if (existsSync(secretPath)) {
    const stored = readFileSync(secretPath, 'utf8').trim();
    if (stored) {
      return stored;
    }
  }

  const generated = randomBytes(48).toString('hex');
  writeFileSync(secretPath, generated, { mode: 0o600 });
  console.warn(`[security] SESSION_SECRET not set; generated a random secret in ${secretPath}`);
  return generated;
}

/**
 * Behind Cloudflare Tunnel or a reverse proxy the app sees plain HTTP, so Express must trust the proxy
 * to know the request was HTTPS; otherwise secure cookies are never sent and login silently fails.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env, cookieSecure = false): boolean | number | string {
  const value = env.TRUST_PROXY?.trim();
  if (!value) {
    return cookieSecure ? 1 : false;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

type AttemptWindow = { failures: number; inFlight: number; resetAt: number };
type LoginAdmission =
  | { allowed: false; retryAfter: number }
  | { allowed: true; finish: (success: boolean) => void };

/** Reserves account/client budgets and a bounded password-verification slot before async work. */
export function createLoginLimiter({
  windowMs = 15 * 60 * 1000,
  maxPerAccount = 10,
  maxPerClient = 50,
  maxConcurrent = 10,
  maxEntries = 10_000,
  now = () => Date.now(),
}: {
  windowMs?: number; maxPerAccount?: number; maxPerClient?: number;
  maxConcurrent?: number; maxEntries?: number; now?: () => number;
} = {}) {
  const attempts = new Map<string, AttemptWindow>();
  let inFlight = 0;

  function refresh(entry: AttemptWindow, time: number) {
    if (entry.resetAt <= time) {
      entry.failures = 0;
      entry.resetAt = time + windowMs;
    }
  }

  function prune(time: number) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= time && entry.inFlight === 0) attempts.delete(key);
      else refresh(entry, time);
    }
  }

  // Fixed-size, unambiguous keys also bound memory for unusually long supplied usernames.
  function key(parts: string[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  function seconds(resetAt: number, time: number): number {
    return Math.max(1, Math.ceil((resetAt - time) / 1000));
  }

  return {
    reserve(client: string, username: string): LoginAdmission {
      const time = now();
      prune(time);
      const accountKey = key([client, username.toLowerCase()]);
      const clientKey = key([client]);
      const account = attempts.get(accountKey);
      const clientEntry = attempts.get(clientKey);
      const blockedUntil = Math.max(
        account && account.failures + account.inFlight >= maxPerAccount ? account.resetAt : 0,
        clientEntry && clientEntry.failures + clientEntry.inFlight >= maxPerClient ? clientEntry.resetAt : 0,
      );
      if (blockedUntil > time) return { allowed: false, retryAfter: seconds(blockedUntil, time) };
      if (inFlight >= maxConcurrent) return { allowed: false, retryAfter: 1 };

      const requiredEntries = Number(!account) + Number(!clientEntry);
      if (attempts.size + requiredEntries > maxEntries) {
        // Never evict live budgets: reject new identities until an existing window expires.
        let earliestExpiry = Infinity;
        for (const entry of attempts.values()) earliestExpiry = Math.min(earliestExpiry, entry.resetAt);
        return { allowed: false, retryAfter: Number.isFinite(earliestExpiry) ? seconds(earliestExpiry, time) : 1 };
      }

      const accountWindow = account ?? { failures: 0, inFlight: 0, resetAt: time + windowMs };
      const clientWindow = clientEntry ?? { failures: 0, inFlight: 0, resetAt: time + windowMs };
      attempts.set(accountKey, accountWindow);
      attempts.set(clientKey, clientWindow);
      accountWindow.inFlight += 1;
      clientWindow.inFlight += 1;
      inFlight += 1;
      let finished = false;

      return {
        allowed: true,
        finish(success: boolean) {
          if (finished) return;
          finished = true;
          const finishedAt = now();
          refresh(accountWindow, finishedAt);
          refresh(clientWindow, finishedAt);
          accountWindow.inFlight -= 1;
          clientWindow.inFlight -= 1;
          inFlight -= 1;
          if (success) accountWindow.failures = 0;
          else {
            accountWindow.failures += 1;
            clientWindow.failures += 1;
          }
          // A success clears completed account failures, never other in-flight reservations.
          if (accountWindow.failures === 0 && accountWindow.inFlight === 0) attempts.delete(accountKey);
          if (clientWindow.failures === 0 && clientWindow.inFlight === 0) attempts.delete(clientKey);
        },
      };
    },
  };
}
