import { describe, expect, it } from 'vitest';
import {
  COLLECTION_PAGE_LIMIT,
  COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD,
  buildCollectionTableVisibleColumns,
  shouldVirtualizeCollectionTable
} from '../src/lib/collectionTableState.js';

describe('collection table state helpers', () => {
  it('keeps collection pages within the simple table threshold', () => {
    expect(COLLECTION_PAGE_LIMIT).toBe(20);
    expect(COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD).toBe(100);
    expect(shouldVirtualizeCollectionTable(COLLECTION_PAGE_LIMIT)).toBe(false);
    expect(shouldVirtualizeCollectionTable(50)).toBe(false);
    expect(shouldVirtualizeCollectionTable(100)).toBe(false);
    expect(shouldVirtualizeCollectionTable(101)).toBe(true);
  });

  it('builds a stable visible column id list with mandatory columns first', () => {
    expect(buildCollectionTableVisibleColumns(['year', 'artist', 'year', 'listingPrice'])).toEqual([
      'cover',
      'artist',
      'title',
      'year',
      'listingPrice'
    ]);
  });
});
