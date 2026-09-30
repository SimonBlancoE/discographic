import { fetchCompleteSnapshot, integer, record, type UnknownRecord } from './discogsPagination.js';

type DiscogsInventoryListing = UnknownRecord & {
  id: number;
  release: UnknownRecord & { id: number };
  status: string | null | undefined;
  price: { value: number | null; currency: string | null } | null;
};

function normalizeListing(payload: unknown, invalid: (reason: string) => never): DiscogsInventoryListing {
  const source = record(payload);
  const release = record(source?.release);
  if (!source || !integer(source.id, 1) || !release || !integer(release.id, 1)) {
    return invalid('invalid listing or release identity');
  }
  if (source.status != null && typeof source.status !== 'string') return invalid('invalid listing status');
  const price = record(source.price);
  if (source.price != null && !price) return invalid('invalid listing price');
  if (price?.currency != null && typeof price.currency !== 'string') return invalid('invalid price currency');
  const value = price?.value == null ? null : Number(price.value);
  if (price?.value != null && ((typeof price.value !== 'number' && typeof price.value !== 'string') || !Number.isFinite(value))) {
    return invalid('invalid price value');
  }
  return {
    ...source, id: source.id, release: { ...release, id: release.id }, status: source.status,
    price: price ? { value, currency: typeof price.currency === 'string' ? price.currency : null } : null,
  };
}

export async function fetchCompleteInventory(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  perPage: number,
): Promise<DiscogsInventoryListing[]> {
  return fetchCompleteSnapshot(fetchPage, perPage, {
    name: 'inventory', rowsKey: 'listings', identityName: 'listing',
    normalizeEntry: normalizeListing, identity: listing => listing.id,
  });
}
