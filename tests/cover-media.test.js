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
