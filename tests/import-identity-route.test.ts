import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import * as XLSX from 'xlsx';
import { translate } from '../shared/i18n.js';
import type { TranslationVars } from '../shared/i18n.js';
import type { ImportPreviewResponse } from '../src/lib/types.js';

const dataDir = mkdtempSync(join(tmpdir(), 'discographic-import-identity-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', dataDir);
const { default: db } = await import('../server/db.js');
const { default: importRouter } = await import('../server/routes/import.js');

describe('Import workflow collection copy identity', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(1, 'collector', 'unused');
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(2, 'other-collector', 'unused');
    const insert = db.prepare(`INSERT INTO releases
      (id, user_id, release_id, instance_id, artist, title, rating, notes)
      VALUES (?, ?, ?, ?, 'Fixture artist', 'Fixture release', 1, '[]')`);
    insert.run(11, 1, 101, 1001);
    insert.run(12, 1, 101, 1002);
    insert.run(13, 1, 102, 2001);
    insert.run(21, 2, 101, 1002);
    insert.run(22, 2, 103, 3001);

    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'import-identity-test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = Number(req.get('x-test-user') || 1);
      req.session.authEpoch = 0;
      req.locale = 'en';
      req.t = (key, vars) => translate('en', key, vars as TranslationVars);
      next();
    });
    app.use('/api/import', importRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Could not bind test server');
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    db.prepare('UPDATE releases SET rating = 1').run();
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function preview(csv: string, userId = 1, format: 'csv' | 'xlsx' = 'csv'): Promise<ImportPreviewResponse> {
    const content = format === 'csv' ? csv : new Uint8Array(XLSX.write(XLSX.read(csv, { type: 'string', raw: true }), { type: 'buffer', bookType: 'xlsx' }));
    return previewUpload(content, `collection.${format}`, userId);
  }

  async function previewUpload(content: string | Uint8Array<ArrayBuffer>, filename: string, userId = 1): Promise<ImportPreviewResponse> {
    const response = await uploadPreview(content, filename, userId);
    expect(response.status).toBe(200);
    return response.json();
  }

  async function uploadPreview(content: string | Uint8Array<ArrayBuffer>, filename: string, userId = 1): Promise<Response> {
    const form = new FormData();
    form.append('file', new Blob([content]), filename);
    return fetch(`${baseUrl}/api/import/preview`, { method: 'POST', headers: { 'x-test-user': String(userId) }, body: form });
  }

  async function apply(previewId: string | null, userId = 1): Promise<Response> {
    return fetch(`${baseUrl}/api/import/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': String(userId) },
      body: JSON.stringify({ previewId }),
    });
  }

  it.each([
    'Release ID,Instance ID,Rating\n101,1002,5\n',
    'Instance ID,Release ID,Rating\n1002,101,5\n',
    'ID,Discogs Release,Instance,Rating\n12,101,1002,5\n',
    'ID Discogs,Instancia,Valoración\n101,1002,5\n',
  ])('previews and applies the requested copy regardless of header order: %s', async csv => {
    const result = await preview(csv);
    expect(result.changes).toMatchObject([{ dbId: 12, releaseId: 101, instanceId: 1002, newRating: 5 }]);
    expect(result.errors).toEqual([]);
    expect((await apply(result.previewId, 2)).status).toBe(410);
    const response = await apply(result.previewId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 1 });
    expect(db.prepare('SELECT id, rating FROM releases ORDER BY id').all()).toEqual([
      { id: 11, rating: 1 }, { id: 12, rating: 5 }, { id: 13, rating: 1 }, { id: 21, rating: 1 }, { id: 22, rating: 1 },
    ]);
  });

  it.each([
    'ID,Instance ID,Rating\n11,1002,5\n',
    'Instance ID,Release ID,Rating\n1002,102,5\n',
    'ID,Release ID,Instance ID,Rating\n12,101,2001,5\n',
    'ID,Instance ID,Rating\n21,1002,5\n',
    'Instance,Instance ID,Rating\n1001,1002,5\n',
  ])('reports inconsistent supplied identities without selecting another copy: %s', async csv => {
    const result = await preview(csv);
    expect(result.changes).toEqual([]);
    expect(result).toMatchObject({ matched: 0, unmatched: 1, withChanges: 0 });
    expect(result.unmatchedRows).toMatchObject([{ row: 2, reason: expect.stringMatching(/identifiers.*same collection copy/i) }]);
    expect(result.errors).toMatchObject([{ row: 2, reason: expect.stringMatching(/identifiers.*same collection copy/i) }]);
  });

  it('rejects release-only identity when the local collection contains multiple copies', async () => {
    const result = await preview('Release ID,Rating\n101,5\n');
    expect(result.changes).toEqual([]);
    expect(result).toMatchObject({ matched: 0, unmatched: 1 });
    expect(result.errors).toMatchObject([{ row: 2, reason: expect.stringMatching(/multiple.*copies.*instance/i) }]);
  });

  it.each([
    'Release ID,Instance ID,Instance ID,Rating\n101,1001,1002,5\n',
    'Instance ID,Release ID,Release ID,Rating\n1002,101,102,5\n',
    'ID,ID,Rating\n11,12,5\n',
    'Instance ID,Instance ID,Rating\n1002,1002,5\n',
  ])('rejects repeated CSV identity headers before SheetJS discards their identity semantics: %s', async csv => {
    const response = await uploadPreview(csv, 'collection.csv');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/duplicate identification columns/i) });
    expect(db.prepare('SELECT rating FROM releases WHERE id IN (11, 12)').all()).toEqual([{ rating: 1 }, { rating: 1 }]);
  });

  it('rejects repeated XLSX identity headers before SheetJS renames them', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Release ID', 'Instance ID', 'Instance ID', 'Rating'], [101, 1001, 1002, 5],
    ]));
    const response = await uploadPreview(new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })), 'collection.xlsx');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/duplicate identification columns/i) });
  });

  it('does not treat an original suffixed header as an identity alias', async () => {
    const result = await preview('Release ID,Instance ID,Instance ID_1,Rating\n101,1002,1001,5\n');
    expect(result.changes).toMatchObject([{ dbId: 12, instanceId: 1002 }]);
    expect(result.errors).toEqual([]);
  });

  it.each(['1002.0', '1.002e3', '0x3ea', '+1002', '-1002', '0', '1002x', '9007199254740993'])('rejects malformed CSV identity %s instead of coercing it', async value => {
    const result = await preview(`Release ID,Instance ID,Rating\n101,${value},5\n`);
    expect(result.changes).toEqual([]);
    expect(result).toMatchObject({ unmatched: 1, matched: 0 });
    expect(result.errors).toMatchObject([{ row: 2, reason: expect.stringMatching(/positive whole numbers/i) }]);
  });

  it('validates XLSX identity text before numeric coercion', async () => {
    const result = await preview('Release ID,Instance ID,Rating\n101,1.002e3,5\n', 1, 'xlsx');
    expect(result.changes).toEqual([]);
    expect(result.errors).toMatchObject([{ row: 2, reason: expect.stringMatching(/positive whole numbers/i) }]);
  });

  it.each([
    'Release ID,Rating\n102,5\n',
    'ID,Rating\n13,5\n',
    'Instance ID,Rating\n2001,5\n',
    'Release ID,Instance ID,Rating\n102,,5\n',
  ])('keeps normal unambiguous imports working: %s', async csv => {
    const result = await preview(csv);
    expect(result.changes).toMatchObject([{ dbId: 13, instanceId: 2001, newRating: 5 }]);
    expect(result.errors).toEqual([]);
  });

  it('matches numeric XLSX identities', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Release ID', 'Instance ID', 'Rating'], [101, 1002, 5],
    ]));
    const result = await previewUpload(new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })), 'collection.xlsx');
    expect(result.changes).toMatchObject([{ dbId: 12, instanceId: 1002 }]);
  });

  it('applies only accepted rows from a preview containing identity rejections', async () => {
    const result = await preview('Release ID,Instance ID,Rating\n102,2001,5\n101,,5\n101,0x3ea,5\n102,1002,5\n');
    expect(result).toMatchObject({ matched: 1, unmatched: 3, withChanges: 1 });
    expect(result.errors.map(error => error.row)).toEqual([3, 4, 5]);
    const response = await apply(result.previewId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 1 });
    expect(db.prepare('SELECT id, rating FROM releases ORDER BY id').all()).toEqual([
      { id: 11, rating: 1 }, { id: 12, rating: 1 }, { id: 13, rating: 5 }, { id: 21, rating: 1 }, { id: 22, rating: 1 },
    ]);
  });

  it('never resolves an instance belonging only to another user', async () => {
    const result = await preview('Instance ID,Rating\n3001,5\n');
    expect(result.changes).toEqual([]);
    expect(result.unmatchedRows).toMatchObject([{ row: 2, reason: 'Not found in your collection' }]);
  });
});
