import { describe, expect, it } from 'vitest';
import { getDashboardBadgeGenres, normalizeDashboardStats } from '../shared/contracts/dashboardStats.js';

describe('dashboard stats contract', () => {
  it('normalizes missing payload sections into a stable shape', () => {
    expect(normalizeDashboardStats({})).toEqual({
      totals: {
        total_records: 0,
        total_value: null,
        rated_records: 0,
        notes_records: 0,
        priced_records: 0,
        value_pending_records: 0,
        value_failed_records: 0,
        value_unavailable_records: 0
      },
      genres: [],
      decades: [],
      formats: [],
      labels: [],
      styles: [],
      growth: [],
      topValue: [],
      artists: [],
      lastSync: null,
      displayCurrency: null
    });
  });

  it('keeps only well-formed rows needed by dashboard consumers', () => {
    const normalized = normalizeDashboardStats({
      totals: {
        total_records: '12',
        total_value: '34.5',
        rated_records: '4',
        notes_records: 3,
        priced_records: '2',
        value_pending_records: '5',
        value_failed_records: 1,
        value_unavailable_records: '4'
      },
      genres: [{ name: 'Techno', count: '7' }, { foo: 'bad' }],
      artists: [{ artist: 'Surgeon', count: '2' }, { name: 'bad' }],
      growth: [{ month: '2026-04', count: '9' }, {}],
      topValue: [{ id: '5', release_id: '10', artist: 'A', title: 'B', year: '1999', estimated_value: '28.1' }, { title: 'bad' }],
      lastSync: { started_at: '2026-04-22T10:00:00Z', finished_at: '2026-04-22T10:01:00Z', records_synced: '44', status: 'completed' },
      displayCurrency: 'USD'
    });

    expect(normalized.totals).toEqual({
      total_records: 12,
      total_value: 34.5,
      rated_records: 4,
      notes_records: 3,
      priced_records: 2,
      value_pending_records: 5,
      value_failed_records: 1,
      value_unavailable_records: 4
    });
    expect(normalized.genres).toEqual([{ name: 'Techno', count: 7 }]);
    expect(normalized.artists).toEqual([{ artist: 'Surgeon', count: 2 }]);
    expect(normalized.growth).toEqual([{ month: '2026-04', count: 9 }]);
    expect(normalized.topValue).toEqual([{
      id: 5,
      release_id: 10,
      artist: 'A',
      title: 'B',
      year: 1999,
      cover_url: null,
      estimated_value: 28.1
    }]);
    expect(normalized.lastSync).toEqual({
      started_at: '2026-04-22T10:00:00Z',
      finished_at: '2026-04-22T10:01:00Z',
      records_synced: 44,
      status: 'completed'
    });
    expect(normalized.displayCurrency).toBe('USD');
  });

  it('derives badge genres from normalized stats rows', () => {
    expect(getDashboardBadgeGenres({
      genres: [{ name: 'Techno', count: 9 }, { name: 'Dub', count: 4 }],
      totals: {}
    })).toEqual([
      { name: 'Techno', count: 9 },
      { name: 'Dub', count: 4 }
    ]);
  });

  it('returns empty list for null or undefined stats', () => {
    expect(getDashboardBadgeGenres(null)).toEqual([]);
    expect(getDashboardBadgeGenres(undefined)).toEqual([]);
  });

  it('respects the limit argument', () => {
    const stats = {
      genres: [
        { name: 'A', count: 5 },
        { name: 'B', count: 4 },
        { name: 'C', count: 3 },
        { name: 'D', count: 2 },
        { name: 'E', count: 1 },
        { name: 'F', count: 0 }
      ]
    };
    expect(getDashboardBadgeGenres(stats, 3)).toEqual([
      { name: 'A', count: 5 },
      { name: 'B', count: 4 },
      { name: 'C', count: 3 }
    ]);
  });

  it('returns a fresh slice without mutating input', () => {
    const genres = [{ name: 'Techno', count: 9 }];
    const result = getDashboardBadgeGenres({ genres });
    expect(result).not.toBe(genres);
    expect(genres).toEqual([{ name: 'Techno', count: 9 }]);
  });
});
