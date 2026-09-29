import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  conditionShortLabel,
  DEFAULT_COLLECTION_FIELD_MAP,
  normalizeCollectionFieldMap,
  normalizeCollectionFolders,
} from '../shared/contracts/collectionFields.js';
import { getNoteFieldText, replaceNoteText, resolveNoteFieldId } from '../server/services/notes.js';
import { buildCommunityUpdate } from '../server/services/communityStats.js';
import { createDiscogsRateLimiter } from '../server/middleware/rateLimit.js';
import { parseTimestamp } from '../src/lib/format.js';

const conditionNotes = [
  { field_id: 1, value: 'Mint (M)' },
  { field_id: 2, value: 'Very Good Plus (VG+)' },
];

describe('collection notes vs condition fields', () => {
  it('reads only the requested field instead of joining every field', () => {
    const notes = [...conditionNotes, { field_id: 3, value: 'Bought in Madrid' }];
    expect(getNoteFieldText(notes, 3)).toBe('Bought in Madrid');
    expect(getNoteFieldText(notes, 1)).toBe('Mint (M)');
    expect(getNoteFieldText(conditionNotes, 3)).toBe('');
  });

  it('never resolves the notes field to a condition dropdown when a release has no notes yet', () => {
    expect(resolveNoteFieldId(conditionNotes)).toBe(3);
    expect(replaceNoteText(conditionNotes, 'first note', 3)).toEqual([
      ...conditionNotes,
      { field_id: 3, value: 'first note' },
    ]);
  });
});

describe('collection field map', () => {
  it('maps Discogs field definitions to notes and condition fields', () => {
    const map = normalizeCollectionFieldMap({
      fields: [
        { id: 1, name: 'Media Condition', type: 'dropdown', options: ['Mint (M)', 'Good (G)'] },
        { id: 2, name: 'Sleeve Condition', type: 'dropdown', options: ['Generic'] },
        { id: 3, name: 'Notes', type: 'textarea' },
        { id: 7, name: 'Shelf', type: 'dropdown', options: ['A', 'B'] },
      ],
    });

    expect(map).toEqual({
      notesFieldId: 3,
      mediaFieldId: 1,
      sleeveFieldId: 2,
      mediaOptions: ['Mint (M)', 'Good (G)'],
      sleeveOptions: ['Generic'],
    });
    expect(normalizeCollectionFieldMap(map)).toEqual(map);
  });

  it('falls back to the Discogs defaults for missing or malformed data', () => {
    expect(normalizeCollectionFieldMap(null)).toEqual(DEFAULT_COLLECTION_FIELD_MAP);
    expect(normalizeCollectionFieldMap({ fields: 'nope' })).toEqual(DEFAULT_COLLECTION_FIELD_MAP);
  });

  it('drops the virtual "All" folder', () => {
    expect(normalizeCollectionFolders({ folders: [{ id: 0, name: 'All', count: 5 }, { id: 9, name: 'Crate', count: 2 }] }))
      .toEqual([{ id: 9, name: 'Crate', count: 2 }]);
  });

  it('shortens grading labels', () => {
    expect(conditionShortLabel('Very Good Plus (VG+)')).toBe('VG+');
    expect(conditionShortLabel('Near Mint (NM or M-)')).toBe('NM');
    expect(conditionShortLabel('Generic')).toBe('Generic');
  });
});

describe('community stats', () => {
  it('extracts have/want/rating from a release detail payload', () => {
    expect(buildCommunityUpdate({
      master_id: 96559,
      num_for_sale: 119,
      community: { have: 4120, want: 589, rating: { count: 241, average: 3.86 } },
    })).toEqual({
      master_id: 96559,
      community_have: 4120,
      community_want: 589,
      community_rating: 3.86,
      community_rating_count: 241,
      num_for_sale: 119,
    });
    expect(buildCommunityUpdate(null).community_have).toBeNull();
    expect(buildCommunityUpdate({ master_id: 0 }).master_id).toBeNull();
  });
});

describe('Discogs rate limiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never lets concurrent waiters exceed the per-minute budget', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const waitTurn = createDiscogsRateLimiter();
    const granted: number[] = [];

    const turns = Array.from({ length: 60 }, () => waitTurn().then(() => granted.push(Date.now())));
    await vi.advanceTimersByTimeAsync(0);
    expect(granted).toHaveLength(55);

    await vi.advanceTimersByTimeAsync(61_000);
    await Promise.all(turns);
    expect(granted).toHaveLength(60);
    const start = granted[0];
    expect(granted.filter((time) => time - start < 60_000)).toHaveLength(55);
  });
});

describe('timestamps', () => {
  it('reads SQLite CURRENT_TIMESTAMP values as UTC and rejects garbage', () => {
    expect(parseTimestamp('2026-09-26 10:00:00')?.toISOString()).toBe('2026-09-26T10:00:00.000Z');
    expect(parseTimestamp('2026-09-26T10:00:00.000Z')?.toISOString()).toBe('2026-09-26T10:00:00.000Z');
    expect(parseTimestamp('not a date')).toBeNull();
  });
});
