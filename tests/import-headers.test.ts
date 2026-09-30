import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import session from 'express-session';
import * as XLSX from 'xlsx';
import { translate, type TranslationVars } from '../shared/i18n.js';
import type { ImportPreviewResponse } from '../src/lib/types.js';

const directory = mkdtempSync(join(tmpdir(), 'discographic-import-headers-'));
vi.stubEnv('DISCOGRAPHIC_DATA_DIR', directory);
const { default: db, setCollectionFieldMap } = await import('../server/db.js');
const { default: router } = await import('../server/routes/import.js');

// These are export fixtures. Header recognition, file parsing and edits all run through production.
const englishHeaders = ['ID', 'Discogs Release', 'Instance', 'Artist', 'Title', 'Year', 'Genres', 'Styles', 'Formats', 'Labels', 'Country', 'Rating', 'Notes', 'Date added', 'Min. price EUR', 'Listing', 'My price', 'Tracks'];
const spanishHeaders = ['ID', 'ID Discogs', 'Instancia', 'Artista', 'Título', 'Año', 'Géneros', 'Estilos', 'Formatos', 'Sellos', 'País', 'Valoración', 'Notas', 'Fecha de alta', 'Precio mín. EUR', 'En venta', 'Mi precio', 'Pistas'];
const exportRow = [11, 101, 1001, 'Ignored artist', 'Ignored title', 2000, 'Ignored genre', 'Ignored style', 'CD', 'Label', 'UK', 5, 'New note', '2020-01-01', 99, 'For Sale', 45, 'Ignored tracks'];

describe('Import workflow parses real CSV/XLSX headers', () => {
  let server: Server;
  let baseUrl: string;
  beforeAll(async () => {
    db.exec("INSERT INTO users (id, username, password_hash) VALUES (1, 'collector', 'unused')");
    setCollectionFieldMap(1, { fields: [{ id: 9, name: 'Notes', type: 'textarea' }] });
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'import-header-fixture', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 1; req.session.authEpoch = 0;
      req.locale = req.get('x-test-locale') === 'es' ? 'es' : 'en';
      req.t = (key, vars) => translate(req.locale, key, vars as TranslationVars);
      next();
    });
    app.use('/api/import', router);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not bind fixture server');
      baseUrl = `http://127.0.0.1:${address.port}`; resolve();
    }); });
  });
  beforeEach(() => {
    db.exec(`DELETE FROM pending_import_edits; DELETE FROM releases;
      INSERT INTO releases (id, user_id, release_id, instance_id, title, artist, year, rating, notes, estimated_value)
      VALUES (11, 1, 101, 1001, 'Original title', 'Original artist', 1970, 1,
        '[{"field_id":1,"value":"VG+"},{"field_id":9,"value":"Old note"}]', 12);`);
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true });
  });
  async function upload(content: string | Uint8Array<ArrayBuffer>, filename = 'collection.csv', locale = 'en'): Promise<Response> {
    const form = new FormData(); form.append('file', new Blob([content]), filename);
    return fetch(`${baseUrl}/api/import/preview`, { method: 'POST', headers: { 'x-test-locale': locale }, body: form });
  }
  async function preview(headers: string[], row: Array<string | number>, format: 'csv' | 'xlsx', locale: string): Promise<ImportPreviewResponse> {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, row]));
    const content = format === 'csv' ? XLSX.write(workbook, { type: 'string', bookType: 'csv' }) as string
      : new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const response = await upload(content, `collection.${format}`, locale);
    expect(response.status).toBe(200); return response.json();
  }
  it.each(([
    ['English', englishHeaders, 'en', 'csv'], ['English', englishHeaders, 'es', 'csv'],
    ['Spanish', spanishHeaders, 'en', 'csv'], ['Spanish', spanishHeaders, 'es', 'csv'],
    ['English', englishHeaders, 'en', 'xlsx'], ['English', englishHeaders, 'es', 'xlsx'],
    ['Spanish', spanishHeaders, 'en', 'xlsx'], ['Spanish', spanishHeaders, 'es', 'xlsx'],
  ] as const).map(([name, headers, locale, format]) => ({ name, headers, locale, format })))('imports $name export for locale $locale ($format)', async ({ headers, locale, format }) => {
    const result = await preview([...headers], exportRow, format, locale);
    expect(result).toMatchObject({ totalRows: 1, matched: 1, withChanges: 1, unmatched: 0, errors: [] });
    expect(result.changes).toMatchObject([{ dbId: 11, releaseId: 101, instanceId: 1001, newRating: 5, newNotes: 'New note', ratingChanged: true, notesChanged: true }]);
    expect(db.prepare('SELECT rating FROM releases').get()).toEqual({ rating: 1 });
    const applied = await fetch(`${baseUrl}/api/import/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewId: result.previewId }) });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ applied: 1, syncState: { status: 'local_only' } });
    expect(db.prepare('SELECT title, artist, year, rating, notes, estimated_value FROM releases').get()).toEqual({
      title: 'Original title', artist: 'Original artist', year: 1970, rating: 5, estimated_value: 12,
      notes: '[{"field_id":1,"value":"VG+"},{"field_id":9,"value":"New note"}]',
    });
  });
  it.each([
    [' ID ', 11], ['ID Discogs', 101], ['Release Discogs', 101], ['Discogs Release', 101],
    ['Release ID', 101], ['Instancia', 1001], ['Instance', 1001], ['INSTANCE_ID', 1001],
  ])('resolves the supported identity header %s through the production parser', async (header, value) => {
    const result = await preview([String(header), 'Rating'], [value, 4], 'csv', 'en');
    expect(result.changes).toMatchObject([{ dbId: 11, instanceId: 1001, newRating: 4 }]);
    expect(result.errors).toEqual([]);
  });
  it('parses quoted CSV notes without confusing embedded commas or newlines with columns', async () => {
    const result = await preview(['Instance', 'Notes'], [1001, 'Hello, collection\nSecond line'], 'csv', 'en');
    expect(result.changes).toMatchObject([{ newNotes: 'Hello, collection\nSecond line', notesChanged: true, ratingChanged: false }]);
  });
  it.each([
    ['Artist,Rating\nUnknown,5\n', /identification column/i],
    ['Instance,Artist,Title\n1001,Changed,Changed\n', /editable column/i],
    ['Instance,Rating\n', /does not contain any data rows/i],
    ['Instance,Instance,Rating\n1001,1001,5\n', /duplicate identification columns/i],
  ])('rejects invalid CSV structure without changing the Local collection: %s', async (csv, error) => {
    const response = await upload(csv);
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: expect.stringMatching(error) });
    expect(db.prepare('SELECT title, rating FROM releases').get()).toEqual({ title: 'Original title', rating: 1 });
  });
  it('rolls back confirmed local edits and durable pending fields when a later SQLite write fails', async () => {
    const result = await preview(['Instance', 'Rating', 'Notes'], [1001, 5, 'New note'], 'csv', 'en');
    db.exec("CREATE TRIGGER reject_import_notes BEFORE UPDATE OF notes ON releases BEGIN SELECT RAISE(ABORT, 'Injected notes write failure'); END");
    try {
      const response = await fetch(`${baseUrl}/api/import/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewId: result.previewId }) });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: 'Injected notes write failure' });
      expect(db.prepare('SELECT rating, notes FROM releases').get()).toEqual({ rating: 1, notes: '[{"field_id":1,"value":"VG+"},{"field_id":9,"value":"Old note"}]' });
      expect(db.prepare('SELECT * FROM pending_import_edits').all()).toEqual([]);
    } finally { db.exec('DROP TRIGGER reject_import_notes'); }
  });
  it('rejects an unsupported file extension before parsing it', async () => {
    const response = await upload('Instance,Rating\n1001,5\n', 'collection.txt');
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: expect.stringMatching(/xlsx.*csv/i) });
  });
  it('reports an invalid rating value as a row error without producing an edit', async () => {
    const result = await preview(['Instance', 'Rating'], [1001, 'six'], 'csv', 'en');
    expect(result.changes).toEqual([]);
    expect(result.errors).toMatchObject([{ row: 2, value: 'six', reason: expect.stringMatching(/0.*5/) }]);
    expect(db.prepare('SELECT rating FROM releases').get()).toEqual({ rating: 1 });
  });
});
