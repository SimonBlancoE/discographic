// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { isAllowedRemoteImageUrl, selectTapeteVariant } from '../server/services/coverMedia.js';

describe('cover media service', () => {
  it('allows only Discogs HTTPS image hosts', () => {
    expect(isAllowedRemoteImageUrl('https://i.discogs.com/image.jpg')).toBe(true);
    expect(isAllowedRemoteImageUrl('https://img.discogs.com/image.jpg')).toBe(true);
    expect(isAllowedRemoteImageUrl('http://i.discogs.com/image.jpg')).toBe(false);
    expect(isAllowedRemoteImageUrl('https://example.com/image.jpg')).toBe(false);
    expect(isAllowedRemoteImageUrl('not-a-url')).toBe(false);
  });

  it('picks the smallest variant that avoids upscaling for tapete output', () => {
    expect(selectTapeteVariant(120)).toBe('tapete');
    expect(selectTapeteVariant(260)).toBe('wall');
    expect(selectTapeteVariant(500)).toBe('detail');
  });
});

describe('cover variants', () => {
  it('only accepts known variant names, since the variant becomes part of a file path', async () => {
    const { isCoverVariant } = await import('../server/services/coverMedia.js');
    expect(isCoverVariant('wall')).toBe(true);
    expect(isCoverVariant('poster')).toBe(true);
    expect(isCoverVariant('x/../../2/77-wall')).toBe(false);
    expect(isCoverVariant('constructor')).toBe(false);
    expect(isCoverVariant(undefined)).toBe(false);
  });
});
