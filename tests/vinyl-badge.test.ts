import { describe, expect, it } from 'vitest';
import { buildBadgeGenres } from '../src/components/VinylBadge.jsx';

describe('buildBadgeGenres', () => {
  it('maps top-genre rows to badge swatches', () => {
    const result = buildBadgeGenres([
      { name: 'Techno', count: 12 },
      { name: 'House', count: 9 }
    ]);

    expect(result).toEqual([
      {
        name: 'Techno',
        bg: 'radial-gradient(circle at 35% 35%, #efd9ab, #c9a15c 70%, #7a5a2a)'
      },
      {
        name: 'House',
        bg: 'radial-gradient(circle at 35% 35%, #f3eee4, #cfc6b4 70%, #8a806c)'
      }
    ]);
  });

  it('falls back to neutral swatches when no usable genre data exists', () => {
    expect(buildBadgeGenres([{}, null, '']).map((item) => item.name)).toEqual([
      'DISC 1',
      'DISC 2',
      'DISC 3',
      'DISC 4',
      'DISC 5'
    ]);
  });
});
