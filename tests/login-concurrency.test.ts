import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import express from 'express';
import session from 'express-session';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-login-concurrency-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser } = await import('../server/db.js');
const { default: authRouter } = await import('../server/routes/auth.js');
createUser('collector', bcrypt.hashSync('correct-password', 4));

let server: Server;
let baseUrl: string;
let onRequest: (() => void) | undefined;
beforeAll(async () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(session({ secret: 'login-concurrency-test', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.t = key => key; onRequest?.(); next(); });
  app.use('/api/auth', authRouter);
  // Suppress expected injected bcrypt failures while preserving the production error path.
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'verification failed' });
  });
  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not bind test server');
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});
afterEach(() => { onRequest = undefined; vi.restoreAllMocks(); });
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

function login(username: string, client: string, password = 'wrong-password'): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': client },
    body: JSON.stringify({ username, password }),
  });
}

async function concurrentLogins(usernames: string[], client: string, error = false) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const allEntered = new Promise<void>(resolve => { entered = resolve; });
  let remaining = usernames.length;
  onRequest = () => { if (--remaining === 0) entered(); };
  const compare = vi.spyOn(bcrypt, 'compare').mockImplementation(async () => {
    await gate;
    if (error) throw new Error('Injected password verification failure');
    return false;
  });
  compare.mockClear();
  const pending = usernames.map(username => login(username, client));
  try {
    await allEntered;
  } finally { release(); }
  const responses = await Promise.all(pending);
  onRequest = undefined;
  return { responses, comparisons: compare.mock.calls.length };
}

describe('production login route concurrent admission', () => {
  it.each(['collector', 'unknown-user'])('reserves account budget before verification for %s', async username => {
    const { responses, comparisons } = await concurrentLogins(Array(12).fill(username), `account-${username}`);
    expect(responses.filter(response => response.status === 401)).toHaveLength(10);
    expect(responses.filter(response => response.status === 429)).toHaveLength(2);
    expect(comparisons).toBe(10);
    for (const response of responses) {
      if (response.status === 429) expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
      if (response.status === 401) expect(await response.json()).toEqual({ error: 'backend.auth.invalid' });
    }
  });

  it('bounds verification across unrelated usernames and releases slots after errors', async () => {
    const { responses, comparisons } = await concurrentLogins(
      Array.from({ length: 12 }, (_, index) => `global-${index}`), 'global-client', true,
    );
    expect(responses.filter(response => response.status === 500)).toHaveLength(10);
    expect(responses.filter(response => response.status === 429)).toHaveLength(2);
    expect(comparisons).toBe(10);
    vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);
    expect((await login('after-error', 'other-client')).status).toBe(401);
  });

  it('reserves the shared client budget across concurrent batches of different usernames', async () => {
    for (let batch = 0; batch < 4; batch += 1) {
      const { responses } = await concurrentLogins(
        Array.from({ length: 10 }, (_, index) => `client-budget-${batch}-${index}`), 'budget-client',
      );
      expect(responses.every(response => response.status === 401)).toBe(true);
    }
    const prefill = await concurrentLogins(Array.from({ length: 5 }, (_, index) => `prefill-${index}`), 'budget-client');
    expect(prefill.responses.every(response => response.status === 401)).toBe(true);
    const boundary = await concurrentLogins(Array.from({ length: 10 }, (_, index) => `boundary-${index}`), 'budget-client');
    expect(boundary.responses.filter(response => response.status === 401)).toHaveLength(5);
    expect(boundary.responses.filter(response => response.status === 429)).toHaveLength(5);
    expect(boundary.comparisons).toBe(5);
    expect((await login('client-budget-overflow', 'budget-client')).status).toBe(429);
  });

  it('keeps pending verification budget when a concurrent login succeeds', async () => {
    let releaseSuccess!: () => void;
    let releaseFailures!: () => void;
    const successGate = new Promise<void>(resolve => { releaseSuccess = resolve; });
    const failureGate = new Promise<void>(resolve => { releaseFailures = resolve; });
    const compare = bcrypt.compare.bind(bcrypt);
    vi.spyOn(bcrypt, 'compare').mockImplementation(async (candidate: string, hash: string) => {
      await (candidate === 'correct-password' ? successGate : failureGate);
      return compare(candidate, hash);
    });
    let entered!: () => void;
    let remaining = 10;
    const initialEntered = new Promise<void>(resolve => { entered = resolve; });
    onRequest = () => { if (--remaining === 0) entered(); };
    const success = login('collector', 'success-client', 'correct-password');
    const failures = Array.from({ length: 9 }, () => login('collector', 'success-client'));
    let extra: Promise<Response>[] = [];
    try {
      await initialEntered;
      releaseSuccess();
      expect((await success).status).toBe(200);
      remaining = 2;
      const extraEntered = new Promise<void>(resolve => { entered = resolve; });
      extra = [login('collector', 'success-client'), login('collector', 'success-client')];
      await extraEntered;
    } finally {
      releaseSuccess();
      releaseFailures();
    }
    expect((await Promise.all(failures)).every(response => response.status === 401)).toBe(true);
    expect((await Promise.all(extra)).map(response => response.status).sort()).toEqual([401, 429]);
  });
});
