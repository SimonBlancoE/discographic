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
      label: ''
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
      "WHERE user_id = ? AND cover_url IS NOT NULL AND cover_url != '' AND (artist LIKE ? OR title LIKE ?) AND labels LIKE ?"
    );
    expect(result.params).toEqual([9, '%Theo%', '%Theo%', '%Warp%']);
  });

  it('returns every distinct label option for the selector', () => {
    const labelNames = Array.from({ length: 105 }, (_, index) => `Label ${String(index).padStart(3, '0')}`);
    const db = {
      prepare: () => ({
        all: () => [
          {
            genres: JSON.stringify(['Electronic']),
            styles: JSON.stringify(['Techno']),
            formats: JSON.stringify([{ name: 'Vinyl' }]),
            labels: JSON.stringify(labelNames.map((name) => ({ name }))),
            year: 1994
          }
        ]
      })
    };

    const options = getCollectionFilterOptions(db, 9);

    expect(options.labels).toHaveLength(labelNames.length);
    expect(options.labels).toEqual(labelNames);
  });
});
