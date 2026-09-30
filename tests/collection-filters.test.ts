import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createCollectionFilters, getActiveCollectionFilters } from '../shared/collectionFilters.js';
import { buildReleaseFilterWhere, getCollectionFilterOptions } from '../server/services/releaseFilters.js';

describe('collection filters', () => {
  it('normalizes the shared filter shape', () => {
    expect(createCollectionFilters({ search: ' Jeff ', style: 'Techno' })).toEqual({
      search: 'Jeff',
      genre: '',
      style: 'Techno',
      decade: '',
      format: '',
      label: '',
      folder: '',
      condition: ''
    });
  });

  it('drops empty filters when building query params', () => {
    expect(getActiveCollectionFilters({
      search: 'Jeff',
      genre: '',
      style: 'Techno',
      decade: '',
      format: '',
      label: ''
    })).toEqual({
      search: 'Jeff',
      style: 'Techno'
    });
  });

  it('shares one SQL builder across collection, export, and tapete routes', () => {
    const result = buildReleaseFilterWhere({
      userId: 9,
      filters: { search: 'Theo', label: 'Warp' },
      baseClauses: ["cover_url IS NOT NULL", "cover_url != ''"]
    });

    expect(result.clause).toBe(
      "WHERE user_id = ? AND cover_url IS NOT NULL AND cover_url != '' AND (artist LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') AND labels LIKE ? ESCAPE '\\'"
    );
    expect(result.params).toEqual([9, '%Theo%', '%Theo%', '%"name":"Warp"%']);
  });

  it('matches whole genre/style entries and escapes LIKE wildcards', () => {
    const result = buildReleaseFilterWhere({ userId: 1, filters: { genre: 'Rock', search: '100%_' } });
    expect(result.params).toEqual([1, '%100\\%\\_%', '%100\\%\\_%', '%"Rock"%']);
  });

  it('filters by folder and by media condition, including ungraded releases', () => {
    const graded = buildReleaseFilterWhere({ userId: 1, filters: { folder: '42', condition: 'Mint (M)' }, mediaFieldId: 1 });
    expect(graded.clause).toContain('folder_id = ?');
    expect(graded.clause).toContain('EXISTS (SELECT 1 FROM json_each(');
    expect(graded.params).toEqual([1, 42, 1, 'Mint (M)']);

    const ungraded = buildReleaseFilterWhere({ userId: 1, filters: { condition: '__ungraded__' }, mediaFieldId: 1 });
    expect(ungraded.clause).toContain('NOT EXISTS (SELECT 1 FROM json_each(');
    expect(ungraded.params).toEqual([1, 1]);
  });

  it('returns every distinct label option for the selector', () => {
    const labelNames = Array.from({ length: 105 }, (_, index) => `Label ${String(index).padStart(3, '0')}`);
    const db = new Database(':memory:');
    try {
      db.exec(`CREATE TABLE releases (
        user_id INTEGER, genres TEXT, styles TEXT, formats TEXT, labels TEXT, year INTEGER, notes TEXT
      )`);
      db.prepare('INSERT INTO releases VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        9, '["Electronic"]', '["Techno"]', '[{"name":"Vinyl"}]',
        JSON.stringify(labelNames.map((name) => ({ name }))), 1994, '[]',
      );

      const options = getCollectionFilterOptions(db, 9);

      expect(options.labels).toHaveLength(labelNames.length);
      expect(options.labels).toEqual(labelNames);
    } finally {
      db.close();
    }
  });
});
