import { describe, it, expect } from 'vitest';
import { messages } from '../shared/i18n.js';
import { COLUMNS } from '../src/lib/columns.js';

const EXPORT_KEYS = [
  'export.id', 'export.releaseDiscogs', 'export.instance', 'export.artist',
  'export.title', 'export.year', 'export.genres', 'export.styles',
  'export.formats', 'export.labels', 'export.country', 'export.rating',
  'export.notes', 'export.dateAdded', 'export.minPrice', 'export.listingStatus',
  'export.listingPrice', 'export.tracks', 'export.sheetName'
];

describe('i18n keys for table columns', () => {
  it('all column i18n keys exist in Spanish locale', () => {
    for (const col of COLUMNS) {
      expect(messages.es[col.i18nKey], `Missing es key: ${col.i18nKey}`).toBeTruthy();
    }
  });

  it('all column i18n keys exist in English locale', () => {
    for (const col of COLUMNS) {
      expect(messages.en[col.i18nKey], `Missing en key: ${col.i18nKey}`).toBeTruthy();
    }
  });

  it('has listing status key in both locales', () => {
    expect(messages.es['collection.listingStatus']).toBe('Estado venta');
    expect(messages.en['collection.listingStatus']).toBe('Listing');
  });

  it('has listing price key in both locales', () => {
    expect(messages.es['collection.listingPrice']).toBe('Mi precio');
    expect(messages.en['collection.listingPrice']).toBe('My price');
  });

  it('has collection.columns key in both locales', () => {
    expect(messages.es['collection.columns']).toBe('Columnas');
    expect(messages.en['collection.columns']).toBe('Columns');
  });

  it('has collection.currency key in both locales', () => {
    expect(messages.es['collection.currency']).toBe('Divisa');
    expect(messages.en['collection.currency']).toBe('Currency');
  });
});

describe('i18n keys for export headers', () => {
  it('all export keys exist in Spanish locale', () => {
    for (const key of EXPORT_KEYS) {
      expect(messages.es[key], `Missing es key: ${key}`).toBeTruthy();
    }
  });

  it('all export keys exist in English locale', () => {
    for (const key of EXPORT_KEYS) {
      expect(messages.en[key], `Missing en key: ${key}`).toBeTruthy();
    }
  });

  it('Spanish and English export headers differ where expected', () => {
    expect(messages.es['export.artist']).toBe('Artista');
    expect(messages.en['export.artist']).toBe('Artist');
    expect(messages.es['export.minPrice']).toBe('Precio mín.');
    expect(messages.en['export.minPrice']).toBe('Min. price');
    expect(messages.es['export.sheetName']).toBe('Colección');
    expect(messages.en['export.sheetName']).toBe('Collection');
  });
});
