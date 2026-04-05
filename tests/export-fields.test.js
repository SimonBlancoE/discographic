import { describe, it, expect } from 'vitest';

// Test that serializeRelease produces the correct shape including listing columns
describe('Export serialization', () => {
  function serializeRelease(release) {
    const formats = release.formats.map((format) => format?.name || format).join(', ');
    const labels = release.labels.map((label) => label?.name || label).join(', ');

    return {
      ID: release.id,
      Release_Discogs: release.release_id,
      Instancia: release.instance_id,
      Artista: release.artist,
      Titulo: release.title,
      Ano: release.year,
      Generos: release.genres.join(', '),
      Estilos: release.styles.join(', '),
      Formatos: formats,
      Sellos: labels,
      Pais: release.country,
      Rating: release.rating,
      Notas: release.notes_text,
      Fecha_Agregado: release.date_added,
      Precio_Min_EUR: release.estimated_value,
      En_Venta: release.listing_status ?? '',
      Mi_Precio: release.listing_price ?? '',
      Pistas: release.tracklist.map((track) => `${track.position || ''} ${track.title || ''}`.trim()).join(' | ')
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

  it('includes En_Venta with listing status', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15.00 });
    expect(result.En_Venta).toBe('For Sale');
  });

  it('includes Mi_Precio with listing price', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15.00 });
    expect(result.Mi_Precio).toBe(15.00);
  });

  it('En_Venta is empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: null, listing_price: null });
    expect(result.En_Venta).toBe('');
  });

  it('Mi_Precio is empty string when not listed', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: null, listing_price: null });
    expect(result.Mi_Precio).toBe('');
  });

  it('handles undefined listing fields', () => {
    const result = serializeRelease({ ...baseRelease });
    expect(result.En_Venta).toBe('');
    expect(result.Mi_Precio).toBe('');
  });

  it('Draft status is preserved', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'Draft', listing_price: 20.00 });
    expect(result.En_Venta).toBe('Draft');
    expect(result.Mi_Precio).toBe(20.00);
  });

  it('export has all expected fields in order', () => {
    const result = serializeRelease({ ...baseRelease, listing_status: 'For Sale', listing_price: 15 });
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Release_Discogs', 'Instancia', 'Artista', 'Titulo', 'Ano',
      'Generos', 'Estilos', 'Formatos', 'Sellos', 'Pais', 'Rating',
      'Notas', 'Fecha_Agregado', 'Precio_Min_EUR', 'En_Venta', 'Mi_Precio', 'Pistas'
    ]);
  });
});
