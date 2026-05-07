type ReleaseListingPriceFields = {
  listing_status: string | null;
  listing_price: number | null;
};

export function shouldShowReleaseListingPrice(release: ReleaseListingPriceFields) {
  return release.listing_status === 'For Sale' && release.listing_price != null;
}
