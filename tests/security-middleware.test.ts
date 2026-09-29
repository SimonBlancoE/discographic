import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLoginLimiter, resolveSessionSecret, resolveTrustProxy } from '../server/middleware/security.js';

let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('session secret', () => {
  it('uses a real configured secret as-is', () => {
    dir = mkdtempSync(join(tmpdir(), 'discographic-'));
    expect(resolveSessionSecret(dir, { SESSION_SECRET: 'a-real-secret-value' })).toBe('a-real-secret-value');
  });

  it('replaces public placeholder secrets with a generated one that persists across restarts', () => {
    dir = mkdtempSync(join(tmpdir(), 'discographic-'));
    const first = resolveSessionSecret(dir, { SESSION_SECRET: 'discographic-dev-secret' });
    const second = resolveSessionSecret(dir, {});

    expect(first).toMatch(/^[0-9a-f]{96}$/);
    expect(second).toBe(first);
    expect(readFileSync(join(dir, '.session-secret'), 'utf8')).toBe(first);
  });
});

describe('trust proxy', () => {
  it('trusts one proxy hop when secure cookies are enabled, unless configured explicitly', () => {
    expect(resolveTrustProxy({}, false)).toBe(false);
    expect(resolveTrustProxy({}, true)).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' }, true)).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: '2' }, false)).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback' }, false)).toBe('loopback');
  });
});

describe('login limiter', () => {
  it('blocks an account after repeated failures and lifts the block after the window', () => {
    let clock = 0;
    const limiter = createLoginLimiter({ windowMs: 60_000, maxPerAccount: 3, maxPerClient: 100, now: () => clock });

    for (let i = 0; i < 3; i += 1) limiter.recordFailure('1.2.3.4', 'Octo');
    expect(limiter.retryAfter('1.2.3.4', 'octo')).toBe(60);
    expect(limiter.retryAfter('1.2.3.4', 'someone-else')).toBe(0);
    expect(limiter.retryAfter('5.6.7.8', 'octo')).toBe(0);

    clock = 60_001;
    expect(limiter.retryAfter('1.2.3.4', 'octo')).toBe(0);
  });

  it('caps total failures per client and clears the account counter on success', () => {
    const limiter = createLoginLimiter({ maxPerAccount: 2, maxPerClient: 3 });
    limiter.recordFailure('ip', 'a');
    limiter.recordSuccess('ip', 'a');
    limiter.recordFailure('ip', 'a');
    expect(limiter.retryAfter('ip', 'a')).toBe(0);

    limiter.recordFailure('ip', 'b');
    limiter.recordFailure('ip', 'c');
    expect(limiter.retryAfter('ip', 'd')).toBeGreaterThan(0);
  });
});
