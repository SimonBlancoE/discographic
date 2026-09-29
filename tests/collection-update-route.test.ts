// @ts-nocheck
import Database from 'better-sqlite3';
import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memoryDb = vi.hoisted(() => ({ current: null }));
const discogs = vi.hoisted(() => ({
  updateRating: vi.fn(),
  updateField: vi.fn(),
  moveToFolder: vi.fn(),
}));

vi.mock('../server/db.js', async () => {
  const notes = await vi.importActual('../server/services/notes.js');
  return {
    get default() {
      return memoryDb.current;
    },
    getCollectionFieldMap: () => ({ notesFieldId: 3, mediaFieldId: 1, sleeveFieldId: 2, mediaOptions: ['Mint (M)', 'Good (G)'], sleeveOptions: ['Generic'] }),
    getCollectionFolders: () => [{ id: 7, name: 'Crate', count: 1 }],
    hasStoredCollectionFieldMap: () => true,
    setCollectionFieldMap: vi.fn(),
    setCollectionFolders: vi.fn(),
    getSettingForUser: () => 'EUR',
    parseJson: (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } },
    stringifyJson: (value) => JSON.stringify(value ?? []),
    hydrateRelease: (row) => ({
      ...row,
      genres: [], styles: [], formats: [], labels: [], tracklist: [],
      notes: notes.normalizeNotes(notes.parseStoredNotes(row.notes)),
      notes_text: notes.getNoteFieldText(notes.parseStoredNotes(row.notes), 3),
      media_condition: notes.getNoteFieldText(notes.parseStoredNotes(row.notes), 1) || null,
    }),
  };
});

vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => next(),
  getDiscogsClientForUser: () => discogs,
}));

vi.mock('../server/services/exchangeRates.js', async () => ({
  ...(await vi.importActual('../server/services/exchangeRates.js')),
  convertReleasePrices: async (release) => ({ ...release, display_currency: 'EUR' }),
}));

const { default: collectionRouter } = await import('../server/routes/collection.js');

describe('PUT /api/collection/:id', () => {
  let server: Server;
  let baseUrl = '';

  beforeEach(async () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE releases (
      id INTEGER PRIMARY KEY, user_id INTEGER, release_id INTEGER, instance_id INTEGER, title TEXT, artist TEXT,
      year INTEGER, genres TEXT, styles TEXT, formats TEXT, labels TEXT, country TEXT, cover_url TEXT, rating INTEGER,
      notes TEXT, date_added TEXT, estimated_value REAL, marketplace_status TEXT, listing_status TEXT, listing_price REAL,
      listing_currency TEXT, listing_price_eur REAL, tracklist TEXT, folder_id INTEGER, raw_json TEXT, master_id INTEGER,
      community_have INTEGER, community_want INTEGER, community_rating REAL, community_rating_count INTEGER,
      num_for_sale INTEGER, synced_at TEXT)`);
    db.prepare(`INSERT INTO releases (id, user_id, release_id, instance_id, title, artist, rating, notes, folder_id)
      VALUES (1, 5, 100, 200, 'T', 'A', 2, ?, 1)`).run(JSON.stringify([{ field_id: 1, value: 'Good (G)' }, { field_id: 3, value: 'old' }]));
    memoryDb.current = db;
    Object.values(discogs).forEach((fn) => fn.mockReset());

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { userId: 5 };
      req.t = (key) => key;
      next();
    });
    app.use('/api/collection', collectionRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    memoryDb.current.close();
  });

  const put = (body) => fetch(`${baseUrl}/api/collection/1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const row = () => memoryDb.current.prepare('SELECT rating, notes, folder_id FROM releases WHERE id = 1').get();

  it('keeps the steps Discogs accepted when a later write fails', async () => {
    discogs.updateField.mockRejectedValueOnce(new Error('Discogs 500'));

    const response = await put({ rating: 5, notes: 'new note' });

    expect(response.status).toBe(502);
    expect(discogs.updateRating).toHaveBeenCalledTimes(1);
    expect(row().rating).toBe(5);
    expect(JSON.parse(row().notes)).toContainEqual({ field_id: 3, value: 'old' });
  });

  it('updates only the changed fields and never touches the condition when editing notes', async () => {
    const response = await put({ notes: 'new note', media_condition: 'Good (G)', folder_id: 7 });

    expect(response.status).toBe(200);
    expect(discogs.updateField).toHaveBeenCalledTimes(1);
    expect(discogs.updateField).toHaveBeenCalledWith(expect.objectContaining({ fieldId: 3, value: 'new note' }));
    expect(discogs.moveToFolder).toHaveBeenCalledWith(expect.objectContaining({ folderId: 1, targetFolderId: 7 }));
    expect(JSON.parse(row().notes)).toEqual([{ field_id: 1, value: 'Good (G)' }, { field_id: 3, value: 'new note' }]);
    expect(row().folder_id).toBe(7);
  });

  it('rejects invalid ratings, grades and folders before calling Discogs', async () => {
    expect((await put({ rating: 7 })).status).toBe(400);
    expect((await put({ media_condition: 'Excellent' })).status).toBe(400);
    expect((await put({ folder_id: 99 })).status).toBe(400);
    expect(discogs.updateRating).not.toHaveBeenCalled();
  });
});
