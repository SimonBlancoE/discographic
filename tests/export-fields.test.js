import { describe, it, expect } from 'vitest';
import { translate } from '../shared/i18n.js';

// Mirror the export's serializeRelease with localized headers
function serializeRelease(release, t) {
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
    [t('export.minPrice')]: release.estimated_value,
    [t('export.listingStatus')]: release.listing_status ?? '',
    [t('export.listingPrice')]: release.listing_price ?? '',
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
  tracklist: [{ position: 'A1', title: 'Track 1' }],
};

describe('Export serialization — Spanish locale', () => {
  const t = (key, vars) => translate('es', key, vars);

  it('uses Spanish column headers', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15 }, t);
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Release Discogs', 'Instancia', 'Artista', 'Título', 'Año',
      'Géneros', 'Estilos', 'Formatos', 'Sellos', 'País', 'Rating',
      'Notas', 'Fecha agregado', 'Precio mín. EUR', 'En venta', 'Mi precio', 'Pistas'
    ]);
  });

  it('listing status shows For Sale', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15 }, t);
    expect(result['En venta']).toBe('For Sale');
    expect(result['Mi precio']).toBe(15);
  });

  it('listing fields are empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: null, listing_price: null }, t);
    expect(result['En venta']).toBe('');
    expect(result['Mi precio']).toBe('');
  });
});

describe('Export serialization — English locale', () => {
  const t = (key, vars) => translate('en', key, vars);

  it('uses English column headers', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15 }, t);
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Discogs Release', 'Instance', 'Artist', 'Title', 'Year',
      'Genres', 'Styles', 'Formats', 'Labels', 'Country', 'Rating',
      'Notes', 'Date added', 'Min. price EUR', 'Listing', 'My price', 'Tracks'
    ]);
  });

  it('listing status shows For Sale', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15 }, t);
    expect(result['Listing']).toBe('For Sale');
    expect(result['My price']).toBe(15);
  });

  it('listing fields are empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease }, t);
    expect(result['Listing']).toBe('');
    expect(result['My price']).toBe('');
  });
});

describe('Export serialization — edge cases', () => {
  const t = (key, vars) => translate('es', key, vars);

  it('Draft status is preserved', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'Draft', listing_price: 20 }, t);
    expect(result['En venta']).toBe('Draft');
    expect(result['Mi precio']).toBe(20);
  });

  it('price 0 is preserved (not empty string)', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 0 }, t);
    expect(result['Mi precio']).toBe(0);
  });
});
