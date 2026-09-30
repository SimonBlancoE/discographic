import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import { translate, type TranslationVars } from '../shared/i18n.js';

const client = vi.hoisted(() => ({
  getCollection: vi.fn(), getCustomFields: vi.fn(), getCollectionFolders: vi.fn(),
  getCollectionValue: vi.fn(), getInventory: vi.fn(), updateRating: vi.fn(), updateField: vi.fn(), moveToFolder: vi.fn(),
}));
vi.mock('../server/discogs.js', () => ({ createDiscogsClient: () => client }));
vi.mock('../server/services/exchangeRates.js', async original => ({
  ...await original<typeof import('../server/services/exchangeRates.js')>(),
  convertReleasePrices: async (release: unknown) => release,
}));
const dataDir = mkdtempSync(join(tmpdir(), 'discographic-pending-edits-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db, createUser, clearUserCollectionData, deleteUser, upsertDiscogsAccount, setCollectionFieldMap, setCollectionFolders } = await import('../server/db.js');
const { default: importRouter } = await import('../server/routes/import.js');
const { default: collectionRouter } = await import('../server/routes/collection.js');
const { default: syncRouter } = await import('../server/routes/sync.js');
let server: Server;
let baseUrl: string;
let userId: number;
let otherUser: number;
const fieldDefs = { fields: [{ id: 3, name: 'Notes', type: 'textarea' }] };
const folders = { folders: [{ id: 1, name: 'Original', count: 1 }, { id: 7, name: 'Moved', count: 1 }] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function api(path: string, body?: object, method = 'POST', account = userId) {
  return fetch(`${baseUrl}/${path}`, { method, headers: { 'content-type': 'application/json', 'x-test-user': String(account) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function preview(rating: number, notes?: string) {
  const form = new FormData();
  form.append('file', new Blob([`Instance ID,Rating${notes === undefined ? '' : ',Notes'}\n1001,${rating}${notes === undefined ? '' : `,${notes}`}\n`]), 'fixture.csv');
  return (await fetch(`${baseUrl}/import/preview`, { method: 'POST', headers: { 'x-test-user': String(userId) }, body: form })).json();
}
async function apply(rating: number, notes?: string) {
  const { previewId } = await preview(rating, notes);
  expect((await api('import/apply', { previewId })).status).toBe(200);
}
const status = async () => (await api('import/status', undefined, 'GET')).json();
async function terminal() {
  await vi.waitFor(async () => expect((await status()).status).not.toBe('running'), { interval: 5 });
  return status();
}
const row = () => db.prepare('SELECT rating, notes, folder_id FROM releases WHERE user_id = ? AND instance_id = 1001').get(userId);
function seed(account = userId) {
  db.prepare(`INSERT INTO releases (user_id,release_id,instance_id,title,artist,rating,notes,folder_id)
    VALUES (?,101,1001,'Local','Artist',1,'[{"field_id":3,"value":"old"}]',1)`).run(account);
}
async function put(body: object) {
  const release = db.prepare('SELECT id FROM releases WHERE user_id = ?').get(userId) as { id: number };
  return api(`collection/${release.id}`, body, 'PUT');
}
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use(session({ secret: 'pending-fixture', resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.session.userId = Number(req.get('x-test-user')); req.session.authEpoch = 0; req.locale = 'en';
    req.t = (key, vars) => translate('en', key, vars as TranslationVars); next();
  });
  app.use('/import', importRouter); app.use('/collection', collectionRouter); app.use('/sync', syncRouter);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
    baseUrl = `http://127.0.0.1:${address.port}`; resolve();
  }); });
});
beforeEach(() => {
  if (userId) deleteUser(userId); if (otherUser) deleteUser(otherUser);
  userId = createUser('collector', 'unused').id; otherUser = createUser('other', 'unused').id;
  upsertDiscogsAccount(userId, 'fixture', 'fixture-token');
  setCollectionFieldMap(userId, fieldDefs); setCollectionFolders(userId, folders); seed(); seed(otherUser);
  Object.values(client).forEach(fn => fn.mockReset());
  client.getCustomFields.mockResolvedValue(fieldDefs); client.getCollectionFolders.mockResolvedValue(folders);
  client.getCollectionValue.mockResolvedValue({});
  client.getInventory.mockResolvedValue({ pagination: { page: 1, per_page: 100, pages: 0, items: 0 }, listings: [] });
  client.getCollection.mockResolvedValue({ pagination: { page: 1, per_page: 100, pages: 1, items: 1 }, releases: [{
    instance_id: 1001, rating: 1, folder_id: 1,
    notes: [{ field_id: 1, value: 'Remote condition' }, { field_id: 3, value: 'old' }],
    basic_information: { id: 101, title: 'Remote title', artists: [{ name: 'Remote artist' }] },
  }] });
});
afterAll(async () => {
  deleteUser(userId); deleteUser(otherUser);
  await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  vi.unstubAllEnvs(); rmSync(dataDir, { recursive: true, force: true });
});

it('retains failed confirmed fields through a download, no-change reimport and explicit retry', async () => {
  client.updateRating.mockRejectedValue(new Error('Discogs unavailable'));
  client.updateField.mockRejectedValue(new Error('Discogs unavailable'));
  await apply(5, 'confirmed'); await terminal();
  expect((await preview(5, 'confirmed')).withChanges).toBe(0);
  expect((await api('sync', {})).status).toBe(200);
  await vi.waitFor(async () => expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'completed' }), { interval: 5 });
  expect(row()).toMatchObject({ rating: 5 });
  expect(JSON.parse((row() as { notes: string }).notes)).toEqual([{ field_id: 1, value: 'Remote condition' }, { field_id: 3, value: 'confirmed' }]);
  client.updateRating.mockResolvedValue(undefined); client.updateField.mockResolvedValue(undefined);
  expect((await api('import/retry', {})).status).toBe(200);
  expect(await terminal()).toMatchObject({ pending: 0, pendingFailed: 0, status: 'completed' });
  expect(db.prepare('SELECT rating FROM releases WHERE user_id = ?').get(otherUser)).toEqual({ rating: 1 });
});

it('acknowledges partial field success and retries only the remaining notes', async () => {
  client.updateField.mockRejectedValueOnce(new Error('notes rejected'));
  await apply(5, 'confirmed'); expect(await terminal()).toMatchObject({ pending: 1, pendingFailed: 1, failures: [{ reason: 'Notes: notes rejected' }] });
  await api('import/retry', {}); expect(await terminal()).toMatchObject({ pending: 0 });
  expect(client.updateRating).toHaveBeenCalledTimes(1);
  expect(client.updateField).toHaveBeenCalledTimes(2);
});

it('keeps newer imported intent when an older individual write completes', async () => {
  const old = deferred<void>(); client.updateRating.mockReturnValueOnce(old.promise).mockRejectedValue(new Error('import rejected'));
  const individual = put({ rating: 2 }); await vi.waitFor(() => expect(client.updateRating).toHaveBeenCalledTimes(1));
  await apply(5); expect(row()).toMatchObject({ rating: 5 });
  old.resolve(); expect((await individual).status).toBe(200);
  expect(await terminal()).toMatchObject({ pending: 1, pendingFailed: 1 }); expect(row()).toMatchObject({ rating: 5 });
});

it('serializes an in-flight retry before a newer individual edit', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('first rejected')); await apply(5); await terminal();
  const retry = deferred<void>(); client.updateRating.mockReturnValueOnce(retry.promise);
  await api('import/retry', {}); await vi.waitFor(() => expect(client.updateRating).toHaveBeenCalledTimes(2));
  const individual = put({ rating: 3 });
  await new Promise(resolve => setTimeout(resolve, 25)); expect(client.updateRating).toHaveBeenCalledTimes(2);
  retry.resolve(); expect((await individual).status).toBe(200); await terminal();
  expect(row()).toMatchObject({ rating: 3 }); expect(await status()).toMatchObject({ pending: 0 });
  expect(client.updateRating.mock.calls.map(call => call[0].rating)).toEqual([5, 5, 3]);
});

it('resolves current folder after a move and keeps equal-local no-op edits pending', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  expect((await put({ rating: 5, folder_id: 7 })).status).toBe(200);
  expect(await status()).toMatchObject({ pending: 1 });
  await api('import/retry', {}); await terminal();
  expect(client.updateRating).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 7, rating: 5 }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it('retains unsent values as failed when the complete snapshot removes their instance', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  client.getCollection.mockResolvedValue({ pagination: { page: 1, per_page: 100, pages: 0, items: 0 }, releases: [] });
  await api('sync', {});
  await vi.waitFor(async () => expect(await (await api('sync/status', undefined, 'GET')).json()).toMatchObject({ status: 'completed' }), { interval: 5 });
  expect(row()).toBeUndefined(); expect(await status()).toMatchObject({ pending: 1, pendingFailed: 1 });
  await api('import/retry', {}); expect(await terminal()).toMatchObject({ pending: 1, pendingFailed: 1 });
  expect(client.updateRating).toHaveBeenCalledTimes(1);
});

it('reset aborts retries and clears durable values without affecting another account', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  const held = deferred<void>(); client.updateRating.mockReturnValueOnce(held.promise);
  await api('import/retry', {}); await vi.waitFor(() => expect(client.updateRating).toHaveBeenCalledTimes(2));
  const signal = client.updateRating.mock.calls[1]?.[1]?.signal as AbortSignal;
  clearUserCollectionData(userId); seed(); held.resolve();
  expect(signal.aborted).toBe(true); expect(await status()).toMatchObject({ pending: 0, status: 'idle' });
  expect(row()).toMatchObject({ rating: 1 });
});

it('retries durable values from a fresh server process with no preview or in-memory run', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rejected'));
  await apply(5); await terminal();
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/pending-import-restart-server.ts'], {
    cwd: process.cwd(), env: { ...process.env, DISCOGRAPHIC_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let stderr = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    await vi.waitFor(() => { expect(child.exitCode, stderr).toBeNull(); expect(output).toContain('READY http'); }, { timeout: 5000, interval: 10 });
    const freshUrl = /READY (http:\/\/[^\n]+)/.exec(output)![1];
    const headers = { 'x-test-user': String(userId) };
    const freshStatus = async () => (await fetch(`${freshUrl}/import/status`, { headers })).json();
    expect(await freshStatus()).toMatchObject({ status: 'idle', pending: 1, pendingFailed: 1 });
    expect((await fetch(`${freshUrl}/import/retry`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${freshUrl}/import/retry`, { method: 'POST', headers })).status).toBe(200);
    await vi.waitFor(async () => expect(await freshStatus()).toMatchObject({ status: 'completed', pending: 0, pendingFailed: 0 }), { timeout: 3000, interval: 10 });
    expect(row()).toMatchObject({ rating: 5 });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill('SIGTERM'); await exited;
    }
  }
});

it('uses revision CAS when an old completion encounters an identical new pending value', async () => {
  const { queueImportEdit, sendPendingImportEdits, clearPendingImportEdits } = await import('../server/services/pendingImportEdits.js');
  const { createUserJobScope } = await import('../server/services/userJobs.js');
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  const held = deferred<void>(); client.updateRating.mockReturnValueOnce(held.promise);
  const sent = sendPendingImportEdits(db, userId, 1001, client, createUserJobScope(userId));
  await vi.waitFor(() => expect(client.updateRating).toHaveBeenCalledTimes(2));
  clearPendingImportEdits(db, userId);
  db.transaction(() => queueImportEdit(db, userId, 1001, 101, 0, 5))();
  held.resolve(); await sent;
  expect(await status()).toMatchObject({ pending: 1, pendingFailed: 0 });
  await api('import/retry', {}); expect(await terminal()).toMatchObject({ pending: 0 });
});

it('rolls back confirmed Local collection changes if durable storage fails', async () => {
  db.exec(`CREATE TRIGGER reject_pending BEFORE INSERT ON pending_import_edits BEGIN SELECT RAISE(ABORT, 'fixture disk failure'); END`);
  try {
    const { previewId } = await preview(5, 'confirmed');
    expect((await api('import/apply', { previewId })).status).toBe(500);
    expect(row()).toMatchObject({ rating: 1, notes: '[{"field_id":3,"value":"old"}]' });
    expect(await status()).toMatchObject({ pending: 0 });
    expect((await api('import/retry', {})).status).toBe(200);
    await terminal();
  } finally { db.exec('DROP TRIGGER reject_pending'); }
});

it.each(['rating', 'notes'] as const)('does not let an old in-flight import acknowledge newer %s intent', async field => {
  const held = deferred<void>();
  if (field === 'rating') client.updateRating.mockReturnValueOnce(held.promise).mockRejectedValueOnce(new Error('new failed'));
  else client.updateField.mockReturnValueOnce(held.promise).mockRejectedValueOnce(new Error('new failed'));
  await apply(field === 'rating' ? 5 : 1, field === 'notes' ? 'first' : undefined);
  await vi.waitFor(() => expect(field === 'rating' ? client.updateRating : client.updateField).toHaveBeenCalledTimes(1));
  await apply(field === 'rating' ? 3 : 1, field === 'notes' ? 'second' : undefined);
  held.resolve(); expect(await terminal()).toMatchObject({ pending: 1, pendingFailed: 1 });
  expect(row()).toMatchObject(field === 'rating' ? { rating: 3 } : { notes: '[{"field_id":3,"value":"second"}]' });
});

it('preserves newer imported notes while accepting unrelated individual field success', async () => {
  const held = deferred<void>(); client.updateField.mockReturnValueOnce(held.promise).mockRejectedValueOnce(new Error('import failed'));
  const individual = put({ notes: 'individual' }); await vi.waitFor(() => expect(client.updateField).toHaveBeenCalledTimes(1));
  await apply(1, 'imported'); held.resolve(); expect((await individual).status).toBe(200);
  expect(await terminal()).toMatchObject({ pending: 1, pendingFailed: 1 });
  expect(row()).toMatchObject({ notes: '[{"field_id":3,"value":"imported"}]' });
});

it('supersedes failed imported fields only after successful individual edits and retains later failures', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rating rejected')); client.updateField.mockRejectedValueOnce(new Error('notes rejected'));
  await apply(5, 'imported'); await terminal();
  client.updateField.mockRejectedValueOnce(new Error('individual notes rejected'));
  expect((await put({ rating: 3, notes: 'individual' })).status).toBe(502);
  expect(row()).toMatchObject({ rating: 3, notes: '[{"field_id":3,"value":"imported"}]' });
  expect(await status()).toMatchObject({ pending: 1, pendingFailed: 1 });
  await api('import/retry', {}); await terminal();
  expect(client.updateRating.mock.calls.map(call => call[0].rating)).toEqual([5, 3]);
  expect(client.updateField.mock.calls.map(call => call[0].value)).toEqual(['imported', 'individual', 'imported']);
});

it('keeps queue counts and retries scoped to the authenticated account', async () => {
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  expect(await (await api('import/status', undefined, 'GET', otherUser)).json()).toMatchObject({ pending: 0, pendingFailed: 0 });
  expect((await api('import/retry', {}, 'POST', otherUser)).status).toBe(400); // no Discogs account configured
  expect(client.updateRating).toHaveBeenCalledTimes(1);
  expect((await api('import/retry', {}, 'POST', 0)).status).toBe(401);
});

it('account deletion cancels its active retry and cannot erase another account queue', async () => {
  const { queueImportEdit, pendingImportCounts } = await import('../server/services/pendingImportEdits.js');
  queueImportEdit(db, otherUser, 1001, 101, 0, 4);
  client.updateRating.mockRejectedValueOnce(new Error('rejected')); await apply(5); await terminal();
  const held = deferred<void>(); client.updateRating.mockReturnValueOnce(held.promise);
  await api('import/retry', {}); await vi.waitFor(() => expect(client.updateRating).toHaveBeenCalledTimes(2));
  const signal = client.updateRating.mock.calls[1]?.[1]?.signal as AbortSignal;
  deleteUser(userId); held.resolve();
  expect(signal.aborted).toBe(true);
  expect((await api('import/retry', {})).status).toBe(401);
  expect(pendingImportCounts(db, userId)).toEqual({ pending: 0, pendingFailed: 0 });
  expect(pendingImportCounts(db, otherUser)).toEqual({ pending: 1, pendingFailed: 0 });
});

it('reports conflict while a retry owns the import run and ignores a no-op Notes edit', async () => {
  client.updateField.mockRejectedValueOnce(new Error('rejected')); await apply(1, 'imported'); await terminal();
  expect((await put({ notes: 'imported' })).status).toBe(200);
  expect(await status()).toMatchObject({ pending: 1, pendingFailed: 1 });
  const held = deferred<void>(); client.updateField.mockReturnValueOnce(held.promise);
  await api('import/retry', {}); await vi.waitFor(() => expect(client.updateField).toHaveBeenCalledTimes(2));
  expect((await api('import/retry', {})).status).toBe(409);
  held.resolve(); expect(await terminal()).toMatchObject({ pending: 0 });
});
