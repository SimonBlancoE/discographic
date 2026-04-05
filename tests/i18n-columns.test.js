import { describe, it, expect } from 'vitest';
import { messages } from '../shared/i18n.js';
import { COLUMNS } from '../src/lib/columns.js';

describe('i18n keys for columns', () => {
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

  it('has collection.listings key in both locales', () => {
    expect(messages.es['collection.listings']).toBe('En venta');
    expect(messages.en['collection.listings']).toBe('For sale');
  });

  it('has collection.columns key in both locales', () => {
    expect(messages.es['collection.columns']).toBe('Columnas');
    expect(messages.en['collection.columns']).toBe('Columns');
  });
});
