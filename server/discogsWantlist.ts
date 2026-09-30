import { fetchCompleteSnapshot, integer, record, type UnknownRecord } from './discogsPagination.js';

export type DiscogsWantlistEntry = UnknownRecord & { id: number };

function normalizeEntry(value: unknown, invalid: (reason: string) => never): DiscogsWantlistEntry {
  const source = record(value);
  if (!source) return invalid('invalid Wantlist entry');

  const basicId = record(source.basic_information)?.id;
  const id = source.id ?? basicId;
  if (!integer(id, 1) || (source.id !== undefined && !integer(source.id, 1))
    || (basicId !== undefined && (!integer(basicId, 1) || basicId !== id))) {
    return invalid('invalid or conflicting release identity');
  }

  return { ...source, id };
}

export async function fetchCompleteWantlist(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  perPage: number,
): Promise<DiscogsWantlistEntry[]> {
  return fetchCompleteSnapshot(fetchPage, perPage, {
    name: 'Wantlist', rowsKey: 'wants', identityName: 'release', normalizeEntry, identity: entry => entry.id,
  });
}
