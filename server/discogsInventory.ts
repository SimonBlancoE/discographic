import { fetchCompleteSnapshot, integer, record, type UnknownRecord } from './discogsPagination.js';

type DiscogsInventoryListing = UnknownRecord & { id: number; release: UnknownRecord & { id: number } };

function normalizeListing(value: unknown, invalid: (reason: string) => never): DiscogsInventoryListing {
  const source = record(value);
  const release = record(source?.release);
  if (!source || !integer(source.id, 1) || !release || !integer(release.id, 1)) {
    return invalid('invalid listing or release identity');
  }
  return { ...source, id: source.id, release: { ...release, id: release.id } };
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
