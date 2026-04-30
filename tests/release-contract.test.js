import { describe, expect, it } from 'vitest';
import {
  buildLocalCoverUrl,
  normalizeCollectionRelease,
  normalizeCollectionResponse,
  normalizeReleaseDetail,
  normalizeWallRelease,
  normalizeWallResponse
} from '../shared/contracts/release.js';
import { MARKETPLACE_STATUS } from '../shared/contracts/marketplace.js';

const storedRelease = {
  id: '7',
  user_id: 9,
  release_id: '1234',
  instance_id: '55',
  title: 'Kind of Blue',
  artist: 'Miles Davis',
  year: '1959',
  genres: '["Jazz","Modal"]',
  styles: 'not-json',
  formats: '[{"name":"Vinyl","qty":"1"}]',
  labels: '[{"name":"Columbia"}]',
  country: 'US',
  cover_url: '',
  rating: '4',
  notes: [{ field_id: 1, value: 'First press' }],
  notes_text: 'First press',
  date_added: '2026-04-01',
  estimated_value: '28.5',
  marketplace_status: MARKETPLACE_STATUS.PRICED,
  listing_status: 'For Sale',
  listing_price: '35.2',
  listing_currency: 'USD',
  listing_price_eur: '32.1',
  tracklist: '[{"position":"A1","title":"So What"}]',
  folder_id: '2',
  raw_json: '{"community":{"have":5}}',
  synced_at: '2026-04-02T10:00:00.000Z',
  display_currency: 'USD'
};

describe('release contract', () => {
  it('normalizes stored collection rows into the shared release shape', () => {
    expect(normalizeCollectionRelease(storedRelease)).toEqual({
      id: 7,
      user_id: 9,
      release_id: 1234,
      instance_id: 55,
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      year: 1959,
      genres: ['Jazz', 'Modal'],
      styles: [],
      formats: [{ name: 'Vinyl', qty: '1' }],
      labels: [{ name: 'Columbia' }],
      country: 'US',
      cover_url: null,
      rating: 4,
      notes: [{ field_id: 1, value: 'First press' }],
      notes_text: 'First press',
      date_added: '2026-04-01',
      estimated_value: 28.5,
      marketplace_status: MARKETPLACE_STATUS.PRICED,
      listing_status: 'For Sale',
      listing_price: 35.2,
      listing_currency: 'USD',
      listing_price_eur: 32.1,
      folder_id: 2,
      synced_at: '2026-04-02T10:00:00.000Z',
      display_currency: 'USD'
    });
  });

  it('builds detail release cover URLs without fetching cover files', () => {
    const detail = normalizeReleaseDetail(storedRelease);

    expect(buildLocalCoverUrl(7, 'detail')).toBe('/api/media/cover/7?variant=detail');
    expect(detail.detail_cover_url).toBe('/api/media/cover/7?variant=detail');
    expect(detail.wall_cover_url).toBe('/api/media/cover/7?variant=wall');
    expect(detail.poster_cover_url).toBe('/api/media/cover/7?variant=poster');
    expect(detail.tracklist).toEqual([{ position: 'A1', title: 'So What' }]);
    expect(detail.raw_json).toEqual({ community: { have: 5 } });
  });

  it('uses an explicit wall release representation', () => {
    expect(normalizeWallRelease(storedRelease)).toEqual({
      id: 7,
      release_id: 1234,
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      year: 1959,
      genres: ['Jazz', 'Modal'],
      styles: [],
      formats: [{ name: 'Vinyl', qty: '1' }],
      labels: [{ name: 'Columbia' }],
      cover_url: null,
      wall_cover_url: '/api/media/cover/7?variant=wall',
      poster_cover_url: '/api/media/cover/7?variant=poster'
    });
  });

  it('normalizes collection and wall API payloads for client consumers', () => {
    const collection = normalizeCollectionResponse({
      releases: [storedRelease, { id: null }],
      displayCurrency: 'USD',
      pagination: { page: '2', limit: '25', total: '51', totalPages: '3' },
      filters: { genres: ['Jazz'] }
    });

    expect(collection.releases).toHaveLength(1);
    expect(collection.displayCurrency).toBe('USD');
    expect(collection.pagination).toEqual({ page: 2, limit: 25, total: 51, totalPages: 3 });
    expect(collection.filters).toEqual({ genres: ['Jazz'] });

    const wall = normalizeWallResponse({ releases: [storedRelease], filters: { styles: ['Modal'] } });
    expect(wall.releases[0].wall_cover_url).toBe('/api/media/cover/7?variant=wall');
    expect(wall.filters).toEqual({ styles: ['Modal'] });
  });
});
