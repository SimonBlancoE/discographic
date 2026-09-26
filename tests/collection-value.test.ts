import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  getCollectionValueHistory,
  migrateCollectionValueSnapshots,
  parseDiscogsMoney,
  recordCollectionValue,
} from '../server/services/collectionValue.js';
import { getPriceSuggestions, parsePriceSuggestions } from '../server/services/priceSuggestions.js';

describe('Discogs collection value', () => {
  it('parses Discogs money strings with their currency', () => {
    expect(parseDiscogsMoney('€7,335.94')).toEqual({ amount: 7335.94, currency: 'EUR' });
    expect(parseDiscogsMoney('$1,234.50')).toEqual({ amount: 1234.5, currency: 'USD' });
    expect(parseDiscogsMoney('CA$99.00')).toEqual({ amount: 99, currency: 'CAD' });
    expect(parseDiscogsMoney('¥12,000')).toEqual({ amount: 12000, currency: 'JPY' });
    expect(parseDiscogsMoney('')).toBeNull();
    expect(parseDiscogsMoney('n/a')).toBeNull();
  });

  it('keeps one snapshot per user and day, returned oldest first', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
    db.exec('INSERT INTO users (id) VALUES (1), (2)');
    migrateCollectionValueSnapshots(db);

    const payload = { minimum: '€3,769.93', median: '€7,335.94', maximum: '€14,357.71' };
    recordCollectionValue(db, 1, payload, new Date('2026-09-01T10:00:00Z'));
    recordCollectionValue(db, 1, { ...payload, median: '€7,000.00' }, new Date('2026-09-02T10:00:00Z'));
    recordCollectionValue(db, 1, { ...payload, median: '€7,100.00' }, new Date('2026-09-02T18:00:00Z'));
    recordCollectionValue(db, 2, payload, new Date('2026-09-02T10:00:00Z'));
    expect(recordCollectionValue(db, 1, { error: 'nope' })).toBeNull();

    expect(getCollectionValueHistory(db, 1)).toEqual([
      { date: '2026-09-01', currency: 'EUR', minimum: 3769.93, median: 7335.94, maximum: 14357.71 },
      { date: '2026-09-02', currency: 'EUR', minimum: 3769.93, median: 7100, maximum: 14357.71 },
    ]);
    expect(getCollectionValueHistory(db, 2)).toHaveLength(1);
  });
});

describe('Discogs price suggestions', () => {
  it('orders suggestions from best to worst grade and ignores junk entries', () => {
    expect(parsePriceSuggestions({
      'Good (G)': { currency: 'USD', value: 2.5 },
      'Mint (M)': { currency: 'USD', value: 20 },
      'Very Good Plus (VG+)': { currency: 'USD', value: 9.99 },
      broken: 'x',
    })).toEqual({
      currency: 'USD',
      suggestions: [
        { condition: 'Mint (M)', value: 20 },
        { condition: 'Very Good Plus (VG+)', value: 9.99 },
        { condition: 'Good (G)', value: 2.5 },
      ],
    });
    expect(parsePriceSuggestions({})).toBeNull();
  });

  it('reports missing seller settings as an explained unavailable state', async () => {
    const result = await getPriceSuggestions({
      discogs: { getPriceSuggestions: async () => { throw new Error('Discogs 400: {"message": "You must fill out your seller settings first."}'); } },
      userId: 1,
      releaseId: 99,
      convert: async (amount, currency) => ({ amount, currency }),
    });
    expect(result).toEqual({ available: false, reason: 'seller_settings', message: null });
  });

  it('converts suggestions into the display currency', async () => {
    const result = await getPriceSuggestions({
      discogs: { getPriceSuggestions: async () => ({ 'Mint (M)': { currency: 'USD', value: 11 } }) },
      userId: 1,
      releaseId: 100,
      convert: async (amount) => ({ amount: amount / 1.1, currency: 'EUR' }),
    });
    expect(result).toEqual({ available: true, currency: 'EUR', suggestions: [{ condition: 'Mint (M)', value: 10 }] });
  });
});
