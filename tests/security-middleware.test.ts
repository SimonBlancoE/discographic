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
  function reserve(limiter: ReturnType<typeof createLoginLimiter>, client: string, username: string) {
    const result = limiter.reserve(client, username);
    if (!result.allowed) throw new Error(`Unexpected rejection: ${result.retryAfter}`);
    return result.finish;
  }

  it('blocks an account after reserved failures and lifts the block after the window', () => {
    let clock = 0;
    const limiter = createLoginLimiter({ windowMs: 60_000, maxPerAccount: 3, maxPerClient: 100, now: () => clock });
    for (let i = 0; i < 3; i += 1) reserve(limiter, '1.2.3.4', 'Octo')(false);
    expect(limiter.reserve('1.2.3.4', 'octo')).toEqual({ allowed: false, retryAfter: 60 });
    reserve(limiter, '1.2.3.4', 'someone-else')(true);
    reserve(limiter, '5.6.7.8', 'octo')(true);
    clock = 59_001;
    expect(limiter.reserve('1.2.3.4', 'octo')).toEqual({ allowed: false, retryAfter: 1 });
    clock = 60_000;
    reserve(limiter, '1.2.3.4', 'octo')(true);
  });

  it('clears completed account failures on success but preserves the client budget', () => {
    const limiter = createLoginLimiter({ maxPerAccount: 2, maxPerClient: 3 });
    reserve(limiter, 'ip', 'a')(false);
    reserve(limiter, 'ip', 'a')(true);
    reserve(limiter, 'ip', 'a')(false);
    reserve(limiter, 'ip', 'b')(false);
    expect(limiter.reserve('ip', 'd').allowed).toBe(false);
  });

  it('reserves client quota across pending accounts without charging denied admissions', () => {
    const limiter = createLoginLimiter({ maxPerAccount: 2, maxPerClient: 2 });
    const first = reserve(limiter, 'ip', 'a');
    const second = reserve(limiter, 'ip', 'b');
    expect(limiter.reserve('ip', 'c').allowed).toBe(false);
    first(true);
    const third = reserve(limiter, 'ip', 'c');
    expect(limiter.reserve('ip', 'd').allowed).toBe(false);
    second(true);
    third(true);
  });

  it('keeps concurrent account reservations when another login succeeds and finalizes only once', () => {
    const limiter = createLoginLimiter({ maxPerAccount: 2, maxPerClient: 100 });
    const first = reserve(limiter, 'ip', 'a');
    const second = reserve(limiter, 'ip', 'a');
    expect(limiter.reserve('ip', 'a').allowed).toBe(false);
    first(true);
    first(true);
    const third = reserve(limiter, 'ip', 'a');
    expect(limiter.reserve('ip', 'a').allowed).toBe(false);
    second(false);
    third(false);
    expect(limiter.reserve('ip', 'a').allowed).toBe(false);
  });

  it('bounds global work and releases capacity without resetting failed budgets', () => {
    const limiter = createLoginLimiter({ maxConcurrent: 2, maxPerAccount: 1 });
    const first = reserve(limiter, 'ip-a', 'a');
    const second = reserve(limiter, 'ip-b', 'b');
    expect(limiter.reserve('ip-c', 'c')).toEqual({ allowed: false, retryAfter: 1 });
    first(false);
    expect(limiter.reserve('ip-a', 'a').allowed).toBe(false);
    reserve(limiter, 'ip-c', 'c')(true);
    second(true);
  });

  it('bounds attacker-controlled entries without evicting live failure budgets', () => {
    let clock = 0;
    const limiter = createLoginLimiter({ maxEntries: 4, windowMs: 60_000, now: () => clock });
    reserve(limiter, 'first', 'a')(false);
    reserve(limiter, 'second', 'b')(false);
    for (let i = 0; i < 100; i += 1) {
      expect(limiter.reserve(`new-${i}`, 'a')).toEqual({ allowed: false, retryAfter: 60 });
    }
    // Existing entries remain usable; map capacity must not erase their failures.
    for (let i = 0; i < 9; i += 1) reserve(limiter, 'first', 'a')(false);
    expect(limiter.reserve('first', 'a')).toEqual({ allowed: false, retryAfter: 60 });
    clock = 60_000;
    reserve(limiter, 'third', 'c')(true);
    reserve(limiter, 'fourth', 'd')(true);
  });

  it('retains in-flight reservations beyond expiry and counts late failures in a fresh window', () => {
    let clock = 0;
    const limiter = createLoginLimiter({ maxEntries: 2, maxPerAccount: 1, windowMs: 60_000, now: () => clock });
    const pending = reserve(limiter, 'ip', 'a');
    clock = 60_001;
    expect(limiter.reserve('other', 'b').allowed).toBe(false);
    expect(limiter.reserve('ip', 'a')).toEqual({ allowed: false, retryAfter: 60 });
    pending(false);
    expect(limiter.reserve('ip', 'a')).toEqual({ allowed: false, retryAfter: 60 });
    clock = 120_001;
    reserve(limiter, 'other', 'b')(true);
  });

  it('keeps username and client keys distinct for delimiter-like usernames', () => {
    const limiter = createLoginLimiter({ maxPerAccount: 1, maxPerClient: 3 });
    reserve(limiter, 'ip', '*')(false);
    reserve(limiter, 'ip', 'someone-else')(true);
    expect(limiter.reserve('ip', '*').allowed).toBe(false);
  });
});
