import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCollectionFilterOptions } from '../server/services/releaseFilters.js';

const facetSql = 'SELECT genres, styles, formats, labels, year, notes FROM releases WHERE user_id = ?';
const databases: Database.Database[] = [];
const directories: string[] = [];

function openDatabase(filename = ':memory:') {
  let scans = 0;
  const db = new Database(filename, {
    verbose(sql) {
      if (typeof sql === 'string' && sql.startsWith(facetSql.replace('?', ''))) scans++;
    },
  });
  databases.push(db);
  db.exec(`CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY, user_id INTEGER, genres TEXT, styles TEXT,
    formats TEXT, labels TEXT, year INTEGER, notes TEXT
  )`);
  return { db, scans: () => scans };
}

function insertRelease(db: Database.Database, userId = 1, genre = 'Electronic') {
  db.prepare(`INSERT INTO releases (user_id, genres, styles, formats, labels, year, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, JSON.stringify([genre]), '["Techno"]', '[{"name":"Vinyl"}]',
      '[{"name":"Warp"}]', 1994, '[{"field_id":1,"value":"Mint (M)"},{"field_id":2,"value":"Good (G)"}]');
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Local collection filter facet cache', () => {
  it('scans unchanged collection rows once across repeated page requests', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);

    for (let page = 1; page <= 5; page++) {
      expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Electronic']);
    }

    expect(scans()).toBe(1);
  });

  it('keeps users and database instances isolated', () => {
    const first = openDatabase();
    const second = openDatabase();
    insertRelease(first.db, 1, 'Rock');
    insertRelease(first.db, 2, 'Jazz');
    insertRelease(second.db, 1, 'Classical');

    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Rock']);
    expect(getCollectionFilterOptions(first.db, 2).genres).toEqual(['Jazz']);
    expect(getCollectionFilterOptions(second.db, 1).genres).toEqual(['Classical']);
    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Rock']);
    expect(first.scans()).toBe(2);
    expect(second.scans()).toBe(1);
  });

  it('normalizes malformed stored facets without retaining invalid selector values', () => {
    const { db } = openDatabase();
    insertRelease(db);
    db.prepare('UPDATE releases SET genres = ?, styles = ?, formats = ?, labels = ?, notes = ?')
      .run('["Jazz",null,7,{}]', '{}', '[{"name":"Vinyl"},"CD",{}]', 'broken JSON', '{}');
    expect(getCollectionFilterOptions(db, 1)).toEqual({
      genres: ['Jazz'], styles: [], formats: ['CD', 'Vinyl'], labels: [],
      decades: [1990], folders: [], conditions: [],
    });
  });

  it('invalidates after inserts, detail updates, imported notes, deletes and account reset', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    getCollectionFilterOptions(db, 1);

    insertRelease(db, 1, 'Rock');
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Electronic', 'Rock']);
    db.prepare('UPDATE releases SET genres = ?, labels = ? WHERE id = 1').run('["Jazz"]', '[{"name":"Blue Note"}]');
    expect(getCollectionFilterOptions(db, 1).labels).toEqual(['Blue Note', 'Warp']);
    db.transaction(() => {
      db.prepare('UPDATE releases SET notes = ? WHERE user_id = ?').run('[{"field_id":1,"value":"Near Mint"}]', 1);
    })();
    expect(getCollectionFilterOptions(db, 1).conditions).toEqual(['Near Mint']);
    db.prepare('DELETE FROM releases WHERE id = ? AND user_id = ?').run(2, 1);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Jazz']);
    db.prepare('DELETE FROM releases WHERE user_id = ?').run(1);
    expect(getCollectionFilterOptions(db, 1)).toEqual({
      genres: [], styles: [], decades: [], formats: [], labels: [], folders: [], conditions: [],
    });
    expect(scans()).toBe(6);
  });

  it('notices commits by another SQLite connection', () => {
    const directory = mkdtempSync(join(tmpdir(), 'discographic-facets-'));
    directories.push(directory);
    const first = openDatabase(join(directory, 'collection.sqlite'));
    const second = openDatabase(join(directory, 'collection.sqlite'));
    insertRelease(first.db);
    getCollectionFilterOptions(first.db, 1);

    second.db.prepare('UPDATE releases SET genres = ? WHERE user_id = ?').run('["Jazz"]', 1);

    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Jazz']);
    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Jazz']);
    expect(first.scans()).toBe(2);
  });

  it('does not stamp older rows with a revision committed after reading them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'discographic-facets-'));
    directories.push(directory);
    const first = openDatabase(join(directory, 'collection.sqlite'));
    const second = openDatabase(join(directory, 'collection.sqlite'));
    insertRelease(first.db);
    const prepare = first.db.prepare.bind(first.db);
    let commitAfterRead = true;
    vi.spyOn(first.db, 'prepare').mockImplementation((sql: string) => {
      const statement = prepare(sql);
      if (sql === facetSql) {
        const all = statement.all.bind(statement);
        vi.spyOn(statement, 'all').mockImplementation((...params: unknown[]) => {
          const rows = all(...params);
          if (commitAfterRead) {
            commitAfterRead = false;
            second.db.prepare('UPDATE releases SET genres = ? WHERE user_id = ?').run('["Jazz"]', 1);
          }
          return rows;
        });
      }
      return statement;
    });

    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Electronic']);
    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Jazz']);
    expect(getCollectionFilterOptions(first.db, 1).genres).toEqual(['Jazz']);
    expect(first.scans()).toBe(2);
  });

  it('reads current transactional values and never retains facets from rolled back writes', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    getCollectionFilterOptions(db, 1);
    db.exec('BEGIN');
    db.prepare('UPDATE releases SET genres = ? WHERE user_id = ?').run('["Jazz"]', 1);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Jazz']);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Jazz']);
    db.exec('ROLLBACK');

    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Electronic']);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Electronic']);
    expect(scans()).toBe(4);
  });

  it('does not retain a first-ever read inside a transaction that is rolled back', () => {
    const { db, scans } = openDatabase();
    db.exec('BEGIN');
    insertRelease(db);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual(['Electronic']);
    db.exec('ROLLBACK');
    expect(getCollectionFilterOptions(db, 1).genres).toEqual([]);
    expect(getCollectionFilterOptions(db, 1).genres).toEqual([]);
    expect(scans()).toBe(2);
  });

  it('keeps current caller folders and keys condition facets by media field', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    const folders = [{ id: 1, name: 'Shelf', count: 1 }];
    expect(getCollectionFilterOptions(db, 1, { folders }).folders).toEqual(folders);
    const movedFolders = [{ id: 2, name: 'Box', count: 1 }];
    expect(getCollectionFilterOptions(db, 1, { folders: movedFolders }).folders).toEqual(movedFolders);
    expect(getCollectionFilterOptions(db, 1, { mediaFieldId: 2 }).conditions).toEqual(['Good (G)']);
    expect(getCollectionFilterOptions(db, 1, { mediaFieldId: null }).conditions).toEqual([]);
    expect(getCollectionFilterOptions(db, 1).conditions).toEqual(['Mint (M)']);
    expect(scans()).toBe(3);
  });

  it('isolates every derived array from caller mutations including condition sorting', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    insertRelease(db, 1, 'Jazz');
    db.prepare('UPDATE releases SET notes = ? WHERE id = 2').run('[{"field_id":1,"value":"Good (G)"}]');
    const options = getCollectionFilterOptions(db, 1);
    options.genres.push('Injected');
    options.styles.length = 0;
    options.formats.push('CD');
    options.labels.length = 0;
    options.decades.push(2020);
    options.conditions.sort();

    expect(getCollectionFilterOptions(db, 1)).toEqual({
      genres: ['Electronic', 'Jazz'], styles: ['Techno'], formats: ['Vinyl'], labels: ['Warp'],
      decades: [1990], folders: [], conditions: ['Mint (M)', 'Good (G)'],
    });
    expect(scans()).toBe(1);
  });

  it('expires old facets even if no collection write occurs', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    getCollectionFilterOptions(db, 1);
    clock.mockReturnValue(2_000);
    getCollectionFilterOptions(db, 1);
    clock.mockReturnValue(1_000 + 10 * 60 * 1_000);
    getCollectionFilterOptions(db, 1);
    expect(scans()).toBe(2);
  });

  it('bounds retained users while keeping recently used facets available', () => {
    const { db, scans } = openDatabase();
    insertRelease(db);
    getCollectionFilterOptions(db, 1);
    for (let userId = 2; userId <= 256; userId++) getCollectionFilterOptions(db, userId);
    expect(scans()).toBe(256);
    getCollectionFilterOptions(db, 256);
    expect(scans()).toBe(256);
    getCollectionFilterOptions(db, 1);
    expect(scans()).toBe(257);
  });
});
