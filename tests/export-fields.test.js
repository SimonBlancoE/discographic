import { describe, it, expect } from 'vitest';
import { translate } from '../shared/i18n.js';
import { DEFAULT_CURRENCY, convertAmountWithRates } from '../server/services/exchangeRates.js';
import { buildReleaseFilterWhere } from '../server/services/releaseFilters.js';

const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };

function serializeRelease(release, t, currency) {
  const formats = release.formats.map((format) => format?.name || format).join(', ');
  const labels = release.labels.map((label) => label?.name || label).join(', ');

  return {
    [t('export.id')]: release.id,
    [t('export.releaseDiscogs')]: release.release_id,
    [t('export.instance')]: release.instance_id,
    [t('export.artist')]: release.artist,
    [t('export.title')]: release.title,
    [t('export.year')]: release.year,
    [t('export.genres')]: release.genres.join(', '),
    [t('export.styles')]: release.styles.join(', '),
    [t('export.formats')]: formats,
    [t('export.labels')]: labels,
    [t('export.country')]: release.country,
    [t('export.rating')]: release.rating,
    [t('export.notes')]: release.notes_text,
    [t('export.dateAdded')]: release.date_added,
    [t('export.minPrice')]: convertAmountWithRates(release.estimated_value, DEFAULT_CURRENCY, currency, rates),
    [t('export.listingStatus')]: release.listing_status ?? '',
    [t('export.listingPrice')]: release.listing_price_eur == null ? '' : convertAmountWithRates(release.listing_price_eur, DEFAULT_CURRENCY, currency, rates),
    [t('export.tracks')]: release.tracklist.map((track) => `${track.position || ''} ${track.title || ''}`.trim()).join(' | ')
  };
}

const baseRelease = {
  id: 1,
  release_id: 1234,
  instance_id: 5678,
  artist: 'Test Artist',
  title: 'Test Album',
  year: 2024,
  genres: ['Electronic'],
  styles: ['Techno'],
  formats: [{ name: 'Vinyl' }],
  labels: [{ name: 'Warp' }],
  country: 'UK',
  rating: 4,
  notes_text: 'Great album',
  date_added: '2024-01-01',
  estimated_value: 25.99,
  listing_price_eur: 13.64,
  tracklist: [{ position: 'A1', title: 'Track 1' }],
};

describe('Export serialization — Spanish locale', () => {
  const t = (key, vars) => translate('es', key, vars);

  it('uses Spanish column headers', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale' }, t, 'EUR');
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Release Discogs', 'Instancia', 'Artista', 'Título', 'Año',
      'Géneros', 'Estilos', 'Formatos', 'Sellos', 'País', 'Rating',
      'Notas', 'Fecha agregado', 'Precio mín.', 'En venta', 'Mi precio', 'Pistas'
    ]);
  });

  it('listing status shows For Sale and price is converted', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale' }, t, 'USD');
    expect(result['En venta']).toBe('For Sale');
    expect(result['Mi precio']).toBeCloseTo(15.0);
    expect(result['Precio mín.']).toBeCloseTo(28.59);
  });

  it('listing fields are empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: null, listing_price_eur: null }, t, 'EUR');
    expect(result['En venta']).toBe('');
    expect(result['Mi precio']).toBe('');
  });
});

describe('Export serialization — English locale', () => {
  const t = (key, vars) => translate('en', key, vars);

  it('uses English column headers', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale' }, t, 'EUR');
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Discogs Release', 'Instance', 'Artist', 'Title', 'Year',
      'Genres', 'Styles', 'Formats', 'Labels', 'Country', 'Rating',
      'Notes', 'Date added', 'Min. price', 'Listing', 'My price', 'Tracks'
    ]);
  });

  it('listing status shows For Sale and GBP conversion', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale' }, t, 'GBP');
    expect(result['Listing']).toBe('For Sale');
    expect(result['My price']).toBeCloseTo(11.59);
  });

  it('listing fields are empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: null, listing_price_eur: null }, t, 'EUR');
    expect(result['Listing']).toBe('');
    expect(result['My price']).toBe('');
  });
});

describe('Export serialization — edge cases', () => {
  const t = (key, vars) => translate('es', key, vars);

  it('Draft status is preserved', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'Draft' }, t, 'EUR');
    expect(result['En venta']).toBe('Draft');
    expect(result['Mi precio']).toBeCloseTo(13.64);
  });

  it('price 0 is preserved (not empty string)', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price_eur: 0 }, t, 'EUR');
    expect(result['Mi precio']).toBe(0);
  });
});

describe('Export filtering parity', () => {
  it('includes style in the export WHERE clause', () => {
    const result = buildReleaseFilterWhere({ userId: 7, filters: { style: 'Techno' } });
    expect(result.clause).toContain('styles LIKE ?');
    expect(result.params).toEqual([7, '%Techno%']);
  });

  it('supports style together with the rest of the collection filters', () => {
    const result = buildReleaseFilterWhere({
      userId: 5,
      filters: {
        search: 'Jeff',
        genre: 'Electronic',
        style: 'Detroit Techno',
        format: 'Vinyl',
        label: 'Tresor',
        decade: '1990'
      }
    });

    expect(result.clause).toContain('(artist LIKE ? OR title LIKE ?)');
    expect(result.clause).toContain('genres LIKE ?');
    expect(result.clause).toContain('styles LIKE ?');
    expect(result.clause).toContain('formats LIKE ?');
    expect(result.clause).toContain('labels LIKE ?');
    expect(result.clause).toContain('year >= ? AND year < ?');
    expect(result.params).toEqual([
      5,
      '%Jeff%',
      '%Jeff%',
      '%Electronic%',
      '%Detroit Techno%',
      1990,
      2000,
      '%Vinyl%',
      '%Tresor%'
    ]);
  });
});
