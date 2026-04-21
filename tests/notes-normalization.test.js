import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  cleanupStoredNotes,
  countMeaningfulNoteRows,
  hasMeaningfulNotes,
  normalizeNotes,
  notesToText,
  parseStoredNotes
} from '../server/services/notes.js';
import { replaceNoteText, resolveNoteFieldId } from '../server/services/notes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-notes-normalization.db');

describe('notes normalization', () => {
  it('trims note values and drops empty entries', () => {
    expect(normalizeNotes([
      { field_id: 3, value: '  keeps me  ' },
      { field_id: 4, value: '   ' },
      null,
      '  another note  '
    ])).toEqual([
      { field_id: 3, value: 'keeps me' },
      { field_id: null, value: 'another note' }
    ]);
  });

  it('counts only meaningful note rows', () => {
    const rows = [
      { notes: JSON.stringify([]) },
      { notes: JSON.stringify([{ field_id: 3, value: '   ' }]) },
      { notes: JSON.stringify([{ field_id: 3, value: 'kept' }]) },
      { notes: JSON.stringify([{ field_id: 4, value: '  also kept  ' }]) }
    ];

    expect(hasMeaningfulNotes(parseStoredNotes(rows[0].notes))).toBe(false);
    expect(hasMeaningfulNotes(parseStoredNotes(rows[1].notes))).toBe(false);
    expect(countMeaningfulNoteRows(rows)).toBe(2);
  });

  it('derives note text and replaces the resolved notes field consistently', () => {
    const notes = [
      { field_id: 2, value: 'other field' },
      { field_id: 3, value: '  old note  ' }
    ];

    expect(notesToText(notes)).toBe('other field | old note');
    expect(resolveNoteFieldId(notes)).toBe(3);
    expect(replaceNoteText(notes, '  new note  ')).toEqual([
      { field_id: 2, value: 'other field' },
      { field_id: 3, value: 'new note' }
    ]);
    expect(replaceNoteText(notes, '')).toEqual([
      { field_id: 2, value: 'other field' }
    ]);
  });
});

describe('legacy note cleanup', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notes TEXT
      )
    `);

    db.prepare(`
      INSERT INTO releases (notes)
      VALUES
        ('[{"field_id":3,"value":"   "}]'),
        ('[{"field_id":3,"value":"  keep this  "}]'),
        ('[]'),
        (NULL)
    `).run();
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it('rewrites blank legacy notes and preserves meaningful ones', () => {
    const updated = cleanupStoredNotes(db);

    expect(updated).toBe(2);

    const rows = db.prepare('SELECT id, notes FROM releases ORDER BY id ASC').all();
    expect(rows).toEqual([
      { id: 1, notes: '[]' },
      { id: 2, notes: '[{"field_id":3,"value":"keep this"}]' },
      { id: 3, notes: '[]' },
      { id: 4, notes: null }
    ]);
  });
});
