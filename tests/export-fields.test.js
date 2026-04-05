import { describe, it, expect } from 'vitest';

// Test that serializeRelease produces the correct shape including num_for_sale
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
      En_Venta: release.num_for_sale ?? '',
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

  it('includes En_Venta field with integer value', () => {
    const result = serializeRelease({ ...baseRelease, num_for_sale: 15 });
    expect(result.En_Venta).toBe(15);
  });

  it('En_Venta is empty string when null', () => {
    const result = serializeRelease({ ...baseRelease, num_for_sale: null });
    expect(result.En_Venta).toBe('');
  });

  it('En_Venta is empty string when undefined', () => {
    const result = serializeRelease({ ...baseRelease });
    expect(result.En_Venta).toBe('');
  });

  it('En_Venta is 0 when 0', () => {
    const result = serializeRelease({ ...baseRelease, num_for_sale: 0 });
    expect(result.En_Venta).toBe(0);
  });

  it('export has all expected fields in order', () => {
    const result = serializeRelease({ ...baseRelease, num_for_sale: 5 });
    const keys = Object.keys(result);
    expect(keys).toEqual([
      'ID', 'Release_Discogs', 'Instancia', 'Artista', 'Titulo', 'Ano',
      'Generos', 'Estilos', 'Formatos', 'Sellos', 'Pais', 'Rating',
      'Notas', 'Fecha_Agregado', 'Precio_Min_EUR', 'En_Venta', 'Pistas'
    ]);
  });
});
