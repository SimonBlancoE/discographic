import { randomBytes } from 'node:crypto';
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

type AttemptWindow = { failures: number; resetAt: number };

/** Counts failed logins per client+username and per client; successful logins clear the counter. */
export function createLoginLimiter({
  windowMs = 15 * 60 * 1000,
  maxPerAccount = 10,
  maxPerClient = 50,
  now = () => Date.now(),
}: { windowMs?: number; maxPerAccount?: number; maxPerClient?: number; now?: () => number } = {}) {
  const attempts = new Map<string, AttemptWindow>();

  function read(key: string): AttemptWindow | null {
    const entry = attempts.get(key);
    if (entry && entry.resetAt <= now()) {
      attempts.delete(key);
      return null;
    }
    return entry ?? null;
  }

  function bump(key: string) {
    const entry = read(key) ?? { failures: 0, resetAt: now() + windowMs };
    entry.failures += 1;
    attempts.set(key, entry);
  }

  function keys(client: string, username: string) {
    return { account: `${client}|${username.toLowerCase()}`, client: `${client}|*` };
  }

  return {
    /** Seconds until the client may retry, or 0 when the attempt is allowed. */
    retryAfter(client: string, username: string): number {
      const { account, client: clientKey } = keys(client, username);
      const blocked = [
        [read(account), maxPerAccount],
        [read(clientKey), maxPerClient],
      ].find(([entry, max]) => entry && (entry as AttemptWindow).failures >= (max as number)) as [AttemptWindow, number] | undefined;
      return blocked ? Math.max(1, Math.ceil((blocked[0].resetAt - now()) / 1000)) : 0;
    },
    recordFailure(client: string, username: string) {
      const { account, client: clientKey } = keys(client, username);
      bump(account);
      bump(clientKey);
    },
    recordSuccess(client: string, username: string) {
      attempts.delete(keys(client, username).account);
    },
  };
}
