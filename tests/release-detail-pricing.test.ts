import { describe, expect, it } from 'vitest';
import { shouldShowReleaseListingPrice } from '../src/lib/releaseDetailPricing.js';

describe('release detail pricing', () => {
  it('shows the user price only for listed releases with a price', () => {
    expect(shouldShowReleaseListingPrice({ listing_status: 'For Sale', listing_price: 22.5 })).toBe(true);
    expect(shouldShowReleaseListingPrice({ listing_status: 'For Sale', listing_price: 0 })).toBe(true);
  });

  it('hides the user price when the release is not actively listed', () => {
    expect(shouldShowReleaseListingPrice({ listing_status: null, listing_price: 22.5 })).toBe(false);
    expect(shouldShowReleaseListingPrice({ listing_status: 'Draft', listing_price: 22.5 })).toBe(false);
  });

  it('hides the user price when the listing has no price', () => {
    expect(shouldShowReleaseListingPrice({ listing_status: 'For Sale', listing_price: null })).toBe(false);
  });
});
