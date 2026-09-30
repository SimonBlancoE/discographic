import { fetchCompleteSnapshot, integer, record, type SnapshotProgress, type UnknownRecord } from './discogsPagination.js';

type DiscogsCollectionItem = UnknownRecord & {
  instance_id: number;
  basic_information: UnknownRecord & { id: number };
};

function normalizeCollectionItem(value: unknown, invalid: (reason: string) => never): DiscogsCollectionItem {
  const source = record(value);
  const release = record(source?.basic_information);
  if (!source || !integer(source.instance_id, 1) || !release || !integer(release.id, 1)) {
    return invalid('invalid instance or release identity');
  }
  return { ...source, instance_id: source.instance_id, basic_information: { ...release, id: release.id } };
}

export async function fetchCompleteCollection(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  perPage: number,
  onPage?: (progress: SnapshotProgress) => void,
): Promise<DiscogsCollectionItem[]> {
  return fetchCompleteSnapshot(fetchPage, perPage, {
    name: 'collection', rowsKey: 'releases', identityName: 'instance',
    normalizeEntry: normalizeCollectionItem, identity: item => item.instance_id, onPage,
  });
}
