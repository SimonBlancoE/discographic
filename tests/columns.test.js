import { describe, it, expect } from 'vitest';
import { COLUMNS, DEFAULT_VISIBLE, MANDATORY } from '../src/lib/columns.js';

describe('Column registry', () => {
  it('has 11 columns defined', () => {
    expect(COLUMNS).toHaveLength(11);
  });

  it('has cover, artist, title as mandatory', () => {
    expect(MANDATORY).toEqual(['cover', 'artist', 'title']);
  });

  it('excludes listings from default visible', () => {
    expect(DEFAULT_VISIBLE).not.toContain('listings');
  });

  it('includes all non-defaultHidden columns in DEFAULT_VISIBLE', () => {
    const expected = COLUMNS.filter(c => !c.defaultHidden).map(c => c.id);
    expect(DEFAULT_VISIBLE).toEqual(expected);
  });

  it('listings column sorts by num_for_sale', () => {
    const listings = COLUMNS.find(c => c.id === 'listings');
    expect(listings.sortColumn).toBe('num_for_sale');
    expect(listings.sortable).toBe(true);
    expect(listings.defaultHidden).toBe(true);
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

  it('column order is cover, artist, title, year, genre, format, label, rating, notes, price, listings', () => {
    const order = COLUMNS.map(c => c.id);
    expect(order).toEqual([
      'cover', 'artist', 'title', 'year', 'genre', 'format',
      'label', 'rating', 'notes', 'price', 'listings'
    ]);
  });
});
