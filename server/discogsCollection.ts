import { fetchCompleteSnapshot, integer, record, type SnapshotProgress, type UnknownRecord } from './discogsPagination.js';

export type DiscogsCollectionItem = UnknownRecord & {
  rating: number | null | undefined;
  folder_id: number | null | undefined;
  date_added: string | null | undefined;
  instance_id: number;
  basic_information: UnknownRecord & {
    id: number;
    title: string | null | undefined;
    artists: (UnknownRecord & { name: string | null | undefined })[] | null | undefined;
    year: number | null | undefined;
    master_id: number | null | undefined;
    cover_image: string | null | undefined;
    thumb: string | null | undefined;
  };
};

function normalizeCollectionItem(value: unknown, invalid: (reason: string) => never): DiscogsCollectionItem {
  const source = record(value);
  const release = record(source?.basic_information);
  if (!source || !integer(source.instance_id, 1) || !release || !integer(release.id, 1)) {
    return invalid('invalid instance or release identity');
  }
  // Identities alone do not make metadata safe for SQLite or array consumers. Validate
  // optional fields once at the snapshot boundary, before any collection rows are changed.
  function text(value: unknown): string | null | undefined {
    if (value == null || typeof value === 'string') return value;
    return invalid('invalid text metadata');
  }
  function number(value: unknown): number | null | undefined {
    if (value == null || (typeof value === 'number' && Number.isFinite(value))) return value;
    return invalid('invalid numeric metadata');
  }
  function array(value: unknown): unknown[] | null | undefined {
    if (value == null || Array.isArray(value)) return value;
    return invalid('invalid array metadata');
  }
  const artistValues = array(release.artists);
  const artists = artistValues == null ? artistValues : artistValues.map(value => {
    const artist = record(value);
    if (!artist) return invalid('invalid artist metadata');
    return { ...artist, name: text(artist.name) };
  });
  return {
    ...source, instance_id: source.instance_id,
    rating: number(source.rating), folder_id: number(source.folder_id), date_added: text(source.date_added),
    basic_information: {
      ...release, id: release.id, title: text(release.title), artists,
      year: number(release.year), master_id: number(release.master_id),
      cover_image: text(release.cover_image), thumb: text(release.thumb),
      genres: array(release.genres), styles: array(release.styles), formats: array(release.formats), labels: array(release.labels),
    },
  };
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
