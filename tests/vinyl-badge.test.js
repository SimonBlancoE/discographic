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
        bg: 'radial-gradient(circle at 30% 30%, #fef3c7, #f59e0b 70%, #78350f)'
      },
      {
        name: 'House',
        bg: 'linear-gradient(135deg, #67e8f9, #a78bfa)'
      }
    ]);
  });

  it('falls back to default genres when no usable data exists', () => {
    expect(buildBadgeGenres([{}, null, '']).map((item) => item.name)).toEqual([
      'JAZZ',
      'ELECTRONIC',
      'ROCK',
      'SOUL',
      'AMBIENT'
    ]);
  });
});
