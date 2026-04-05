import { describe, it, expect } from 'vitest';
import { COLUMNS, DEFAULT_VISIBLE, MANDATORY } from '../src/lib/columns.js';

describe('Column registry', () => {
  it('has 12 columns defined', () => {
    expect(COLUMNS).toHaveLength(12);
  });

  it('has cover, artist, title as mandatory', () => {
    expect(MANDATORY).toEqual(['cover', 'artist', 'title']);
  });

  it('excludes listing columns from default visible', () => {
    expect(DEFAULT_VISIBLE).not.toContain('listingStatus');
    expect(DEFAULT_VISIBLE).not.toContain('listingPrice');
  });

  it('includes all non-defaultHidden columns in DEFAULT_VISIBLE', () => {
    const expected = COLUMNS.filter(c => !c.defaultHidden).map(c => c.id);
    expect(DEFAULT_VISIBLE).toEqual(expected);
  });

  it('listingPrice column sorts by listing_price', () => {
    const col = COLUMNS.find(c => c.id === 'listingPrice');
    expect(col.sortColumn).toBe('listing_price');
    expect(col.sortable).toBe(true);
    expect(col.defaultHidden).toBe(true);
  });

  it('listingStatus column is not sortable', () => {
    const col = COLUMNS.find(c => c.id === 'listingStatus');
    expect(col.sortable).toBe(false);
    expect(col.defaultHidden).toBe(true);
  });

  it('each column has a unique id', () => {
    const ids = COLUMNS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every sortable column has a sortColumn', () => {
    const sortable = COLUMNS.filter(c => c.sortable);
    for (const col of sortable) {
      expect(col.sortColumn).toBeTruthy();
    }
  });

  it('column order is cover, artist, title, year, genre, format, label, rating, notes, price, listingStatus, listingPrice', () => {
    const order = COLUMNS.map(c => c.id);
    expect(order).toEqual([
      'cover', 'artist', 'title', 'year', 'genre', 'format',
      'label', 'rating', 'notes', 'price', 'listingStatus', 'listingPrice'
    ]);
  });
});
