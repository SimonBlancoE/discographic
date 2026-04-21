import { describe, expect, it } from 'vitest';
import { createCollectionFilters, getActiveCollectionFilters } from '../shared/collectionFilters.js';
import { buildReleaseFilterWhere } from '../server/services/releaseFilters.js';

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
});
