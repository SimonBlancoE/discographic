import { describe, it, expect } from 'vitest';

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ID_COLUMNS = new Map([
  ['id', 'id'],
  ['releasediscogs', 'release_id'],
  ['discogsrelease', 'release_id'],
  ['releaseid', 'release_id'],
  ['instancia', 'instance_id'],
  ['instance', 'instance_id'],
  ['instanceid', 'instance_id'],
]);

const EDITABLE_NORMALIZED = new Set(['rating', 'notas', 'notes']);

describe('Import header recognition', () => {
  describe('Spanish export headers', () => {
    const esHeaders = ['ID', 'Release Discogs', 'Instancia', 'Artista', 'Título', 'Año',
      'Géneros', 'Estilos', 'Formatos', 'Sellos', 'País', 'Rating',
      'Notas', 'Fecha agregado', 'Precio mín. EUR', 'En venta', 'Mi precio', 'Pistas'];

    it('recognizes ID column', () => {
      expect(ID_COLUMNS.has(normalizeHeader('ID'))).toBe(true);
    });

    it('recognizes Release Discogs as release_id', () => {
      expect(ID_COLUMNS.get(normalizeHeader('Release Discogs'))).toBe('release_id');
    });

    it('recognizes Instancia as instance_id', () => {
      expect(ID_COLUMNS.get(normalizeHeader('Instancia'))).toBe('instance_id');
    });

    it('recognizes Rating', () => {
      expect(EDITABLE_NORMALIZED.has(normalizeHeader('Rating'))).toBe(true);
    });

    it('recognizes Notas', () => {
      expect(EDITABLE_NORMALIZED.has(normalizeHeader('Notas'))).toBe(true);
    });

    it('ignores non-editable columns silently', () => {
      const nonEditable = ['Artista', 'Título', 'Año', 'Géneros', 'Estilos',
        'Formatos', 'Sellos', 'País', 'Fecha agregado', 'Precio mín. EUR',
        'En venta', 'Mi precio', 'Pistas'];
      for (const header of nonEditable) {
        const norm = normalizeHeader(header);
        expect(ID_COLUMNS.has(norm) || EDITABLE_NORMALIZED.has(norm),
          `Should not match as id/editable: ${header} → ${norm}`).toBe(false);
      }
    });
  });

  describe('English export headers', () => {
    const enHeaders = ['ID', 'Discogs Release', 'Instance', 'Artist', 'Title', 'Year',
      'Genres', 'Styles', 'Formats', 'Labels', 'Country', 'Rating',
      'Notes', 'Date added', 'Min. price EUR', 'Listing', 'My price', 'Tracks'];

    it('recognizes ID column', () => {
      expect(ID_COLUMNS.has(normalizeHeader('ID'))).toBe(true);
    });

    it('recognizes Discogs Release as release_id', () => {
      expect(ID_COLUMNS.get(normalizeHeader('Discogs Release'))).toBe('release_id');
    });

    it('recognizes Instance as instance_id', () => {
      expect(ID_COLUMNS.get(normalizeHeader('Instance'))).toBe('instance_id');
    });

    it('recognizes Rating', () => {
      expect(EDITABLE_NORMALIZED.has(normalizeHeader('Rating'))).toBe(true);
    });

    it('recognizes Notes', () => {
      expect(EDITABLE_NORMALIZED.has(normalizeHeader('Notes'))).toBe(true);
    });

    it('ignores non-editable columns silently', () => {
      const nonEditable = ['Artist', 'Title', 'Year', 'Genres', 'Styles',
        'Formats', 'Labels', 'Country', 'Date added', 'Min. price EUR',
        'Listing', 'My price', 'Tracks'];
      for (const header of nonEditable) {
        const norm = normalizeHeader(header);
        expect(ID_COLUMNS.has(norm) || EDITABLE_NORMALIZED.has(norm),
          `Should not match as id/editable: ${header} → ${norm}`).toBe(false);
      }
    });
  });

  describe('Cross-locale round-trip', () => {
    it('file exported in English can be imported by Spanish user', () => {
      const enIdHeaders = ['ID', 'Discogs Release', 'Instance'];
      const matched = enIdHeaders.filter(h => ID_COLUMNS.has(normalizeHeader(h)));
      expect(matched.length).toBeGreaterThanOrEqual(1);
    });

    it('file exported in Spanish can be imported by English user', () => {
      const esIdHeaders = ['ID', 'Release Discogs', 'Instancia'];
      const matched = esIdHeaders.filter(h => ID_COLUMNS.has(normalizeHeader(h)));
      expect(matched.length).toBeGreaterThanOrEqual(1);
    });
  });
});
