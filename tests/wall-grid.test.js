import { describe, expect, it } from 'vitest';
import {
  computeWallGridMetrics,
  filterWallReleases,
  getWallCardPosition,
  WALL_GRID_GAP,
  WALL_TITLE_PANEL_HEIGHT
} from '../src/lib/wallGrid.js';

const releases = [
  {
    id: 1,
    artist: 'Jeff Mills',
    title: 'Waveform Transmission',
    year: 1992,
    genres: ['Electronic'],
    styles: ['Techno'],
    formats: [{ name: 'Vinyl' }],
    labels: [{ name: 'Tresor' }]
  },
  {
    id: 2,
    artist: 'Herbie Hancock',
    title: 'Head Hunters',
    year: 1973,
    genres: ['Jazz'],
    styles: ['Jazz-Funk'],
    formats: [{ name: 'LP' }],
    labels: [{ name: 'Columbia' }]
  },
  {
    id: 3,
    artist: 'Surgeon',
    title: 'Basictonalvocabulary',
    year: 1997,
    genres: ['Electronic'],
    styles: ['Techno'],
    formats: [{ name: 'Vinyl' }],
    labels: [{ name: 'Tresor' }]
  }
];

describe('wall filtering', () => {
  it('matches the same filter semantics as the wall UI', () => {
    const filtered = filterWallReleases(releases, {
      search: 'surge',
      genre: 'Electronic',
      style: 'Techno',
      decade: '1990',
      format: 'Vinyl',
      label: 'Tresor'
    });

    expect(filtered).toEqual([releases[2]]);
  });

  it('returns all releases when no filters are active', () => {
    expect(filterWallReleases(releases, {})).toEqual(releases);
  });
});

describe('windowed wall grid metrics', () => {
  it('computes a visible range from viewport and container geometry', () => {
    const metrics = computeWallGridMetrics({
      itemCount: 120,
      containerWidth: 1024,
      minCardSize: 110,
      showTitles: false,
      viewportTop: 1500,
      viewportHeight: 900,
      containerTop: 900
    });

    expect(metrics.columns).toBe(8);
    expect(metrics.startIndex).toBeLessThan(metrics.endIndex);
    expect(metrics.endIndex).toBeLessThanOrEqual(120);
    expect(metrics.totalHeight).toBeGreaterThan(0);
  });

  it('adds title height into card sizing when titles are visible', () => {
    const withoutTitles = computeWallGridMetrics({
      itemCount: 24,
      containerWidth: 900,
      minCardSize: 120,
      showTitles: false
    });
    const withTitles = computeWallGridMetrics({
      itemCount: 24,
      containerWidth: 900,
      minCardSize: 120,
      showTitles: true
    });

    expect(withTitles.cardHeight - withoutTitles.cardHeight).toBe(WALL_TITLE_PANEL_HEIGHT);
    expect(withTitles.totalHeight).toBeGreaterThan(withoutTitles.totalHeight);
  });

  it('keeps the first rows renderable before viewport measurements settle', () => {
    const metrics = computeWallGridMetrics({
      itemCount: 80,
      containerWidth: 960,
      minCardSize: 100,
      showTitles: false,
      viewportHeight: 0
    });

    expect(metrics.startIndex).toBe(0);
    expect(metrics.endIndex).toBeGreaterThan(0);
  });

  it('returns absolute card positions consistent with the computed column width', () => {
    const metrics = computeWallGridMetrics({
      itemCount: 40,
      containerWidth: 860,
      minCardSize: 120,
      showTitles: false
    });

    const position = getWallCardPosition(metrics.columns + 1, metrics);
    expect(position.top).toBe(metrics.rowStride);
    expect(position.left).toBeCloseTo(metrics.columnWidth + WALL_GRID_GAP);
    expect(position.width).toBeCloseTo(metrics.columnWidth);
  });

  it('clamps the window when the page is scrolled past a much smaller filtered result', () => {
    const metrics = computeWallGridMetrics({
      itemCount: 6,
      containerWidth: 860,
      minCardSize: 120,
      showTitles: false,
      viewportTop: 8000,
      viewportHeight: 900,
      containerTop: 1000
    });

    expect(metrics.startIndex).toBeLessThan(metrics.endIndex);
    expect(metrics.endIndex).toBeLessThanOrEqual(6);
  });
});
