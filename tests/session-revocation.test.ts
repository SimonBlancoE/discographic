import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'better-sqlite3-session-store';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-session-revocation-'));
const dbPath = join(dataDir, 'discographic.db');
const legacyDb = new Database(dbPath);
legacyDb.exec(`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT);
  INSERT INTO users VALUES (7, 'legacy-user', 'legacy-hash', 'admin', '2020-01-01');`);
legacyDb.close();
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, getUserAuthById } = await import('../server/db.js');
const { default: authRouter } = await import('../server/routes/auth.js');
const { default: adminRouter } = await import('../server/routes/admin.js');
const { default: accountRouter } = await import('../server/routes/account.js');

const password = 'original-password';
const passwordHash = bcrypt.hashSync(password, 4);
let server: Server;
let baseUrl: string;
let adminId: number;
let collectorId: number;

async function request(path: string, method = 'GET', body?: unknown, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Expected session cookie');
  return cookie;
}
async function login(username = 'collector'): Promise<string> {
  const response = await request('/api/auth/login', 'POST', { username, password });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const SqliteStore = connectSqlite3(session);
  app.use(session({ name: 'discographic.sid', secret: 'session-revocation-test', resave: false, saveUninitialized: false,
    store: new SqliteStore({ client: db, expired: { clear: false } }),
  }));
  app.use((req, _res, next) => { req.t = key => key; next(); });
  // Represents cookies created before authentication versions existed.
  app.post('/legacy-session', (req, res) => { req.session.userId = req.body.userId; res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/account', accountRouter);
  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not bind test server');
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.close();
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

it('migrates legacy users without losing credentials and persists their initial epoch', () => {
  expect(db.prepare('SELECT * FROM users WHERE id = 7').get()).toMatchObject({
    id: 7, username: 'legacy-user', password_hash: 'legacy-hash', role: 'admin', created_at: '2020-01-01', auth_epoch: 0,
  });
  const reopened = new Database(dbPath);
  try {
    expect(reopened.prepare('SELECT auth_epoch FROM users WHERE id = 7').get()).toEqual({ auth_epoch: 0 });
  } finally { reopened.close(); }
});

describe('persistent cookie session revocation through production routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    db.prepare('DELETE FROM users').run();
    adminId = createUser('administrator', passwordHash, 'admin').id;
    collectorId = createUser('collector', passwordHash).id;
  });

  it('rejects preference writes and status authentication after an admin password reset', async () => {
    const collectorCookie = await login();
    const adminCookie = await login('administrator');
    expect((await request('/api/account/preferences/currency', 'PUT', { value: 'USD' }, collectorCookie)).status).toBe(200);
    expect((await request(`/api/admin/users/${collectorId}/password`, 'PUT', { password: 'replacement-password' }, adminCookie)).status).toBe(200);
    expect((await request('/api/account/preferences/currency', 'PUT', { value: 'GBP' }, collectorCookie)).status).toBe(401);
    expect(db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'currency'").get(collectorId)).toEqual({ value: 'USD' });
    expect(await (await request('/api/auth/status', 'GET', undefined, collectorCookie)).json()).toMatchObject({ loggedIn: false, user: null });
    const reopened = new Database(dbPath);
    try { expect(reopened.prepare('SELECT auth_epoch FROM users WHERE id = ?').get(collectorId)).toEqual({ auth_epoch: 1 }); }
    finally { reopened.close(); }
    expect((await request('/api/auth/login', 'POST', { username: 'collector', password })).status).toBe(401);
    const freshLogin = await request('/api/auth/login', 'POST', { username: 'collector', password: 'replacement-password' });
    expect(freshLogin.status).toBe(200);
    expect((await request('/api/account', 'GET', undefined, cookieFrom(freshLogin))).status).toBe(200);
  });

  it('rejects account reads from a deleted user cookie', async () => {
    const cookie = await login();
    const adminCookie = await login('administrator');
    expect((await request(`/api/admin/users/${collectorId}`, 'DELETE', undefined, adminCookie)).status).toBe(200);
    expect((await request('/api/account', 'GET', undefined, cookie)).status).toBe(401);
    expect((await request('/api/auth/me', 'GET', undefined, cookie)).status).toBe(401);
  });

  it('regenerates the password-changing session and revokes all earlier admin sessions', async () => {
    const currentCookie = await login('administrator');
    const otherCookie = await login('administrator');
    const change = await request('/api/auth/change-password', 'POST', { currentPassword: password, newPassword: 'replacement-password' }, currentCookie);
    expect(change.status).toBe(200);
    const freshCookie = cookieFrom(change);
    expect(freshCookie).not.toBe(currentCookie);
    expect((await request('/api/admin/users', 'GET', undefined, currentCookie)).status).toBe(401);
    expect((await request('/api/admin/users', 'GET', undefined, otherCookie)).status).toBe(401);
    expect((await request('/api/admin/users', 'GET', undefined, freshCookie)).status).toBe(200);
  });

  it('rejects a legacy session without a version and regenerates its id at login', async () => {
    const legacy = cookieFrom(await request('/legacy-session', 'POST', { userId: collectorId }));
    expect((await request('/api/account', 'GET', undefined, legacy)).status).toBe(401);
    const response = await request('/api/auth/login', 'POST', { username: 'collector', password }, legacy);
    expect(response.status).toBe(200);
    const freshCookie = cookieFrom(response);
    expect(freshCookie).not.toBe(legacy);
    expect((await request('/api/account', 'GET', undefined, freshCookie)).status).toBe(200);
  });

  it('binds bootstrap sessions to the persisted user epoch', async () => {
    db.prepare('DELETE FROM users').run();
    const response = await request('/api/auth/bootstrap', 'POST', { username: 'bootstrap-admin', password });
    expect(response.status).toBe(200);
    expect((await request('/api/admin/users', 'GET', undefined, cookieFrom(response))).status).toBe(200);
    const user = db.prepare('SELECT id FROM users').get() as { id: number };
    expect(getUserAuthById(user.id)?.auth_epoch).toBe(0);
  });

  it('keeps non-admin sessions forbidden and checks account access without bcrypt', async () => {
    const cookie = await login();
    vi.spyOn(bcrypt, 'compare').mockImplementation(() => { throw new Error('Authenticated requests must not compare passwords'); });
    expect((await request('/api/admin/users', 'GET', undefined, cookie)).status).toBe(403);
    expect((await request('/api/account', 'GET', undefined, cookie)).status).toBe(200);
  });

  it('does not let a pending own password change overwrite an administrator reset', async () => {
    const adminCookie = await login('administrator');
    const cookie = await login();
    let comparisonStarted!: () => void;
    let releaseComparison!: () => void;
    const started = new Promise<void>(resolve => { comparisonStarted = resolve; });
    const release = new Promise<void>(resolve => { releaseComparison = resolve; });
    const compare = bcrypt.compare.bind(bcrypt);
    vi.spyOn(bcrypt, 'compare').mockImplementation(async (candidate: string, hash: string) => {
      const matches = await compare(candidate, hash);
      comparisonStarted();
      await release;
      return matches;
    });
    const pendingChange = request('/api/auth/change-password', 'POST', { currentPassword: password, newPassword: 'own-replacement-password' }, cookie);
    await started;
    try {
      expect((await request(`/api/admin/users/${collectorId}/password`, 'PUT', { password: 'admin-replacement-password' }, adminCookie)).status).toBe(200);
    } finally { releaseComparison(); }
    expect((await pendingChange).status).toBe(401);
    vi.restoreAllMocks();
    expect((await request('/api/auth/login', 'POST', { username: 'collector', password: 'admin-replacement-password' })).status).toBe(200);
    expect((await request('/api/auth/login', 'POST', { username: 'collector', password: 'own-replacement-password' })).status).toBe(401);
  });

  it.each(['reset', 'delete'] as const)('refuses login if a user is %s while bcrypt is pending', async action => {
    const adminCookie = await login('administrator');
    let comparisonStarted!: () => void;
    let releaseComparison!: () => void;
    const started = new Promise<void>(resolve => { comparisonStarted = resolve; });
    const release = new Promise<void>(resolve => { releaseComparison = resolve; });
    const compare = bcrypt.compare.bind(bcrypt);
    vi.spyOn(bcrypt, 'compare').mockImplementation(async (candidate: string, hash: string) => {
      const matches = await compare(candidate, hash);
      comparisonStarted();
      await release;
      return matches;
    });
    const pendingLogin = request('/api/auth/login', 'POST', { username: 'collector', password });
    await started;
    try {
      const mutation = action === 'reset'
        ? await request(`/api/admin/users/${collectorId}/password`, 'PUT', { password: 'replacement-password' }, adminCookie)
        : await request(`/api/admin/users/${collectorId}`, 'DELETE', undefined, adminCookie);
      expect(mutation.status).toBe(200);
    } finally { releaseComparison(); }
    const response = await pendingLogin;
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
