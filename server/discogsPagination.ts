export type UnknownRecord = Record<string, unknown>;

export type SnapshotProgress = { page: number; pages: number; items: number; current: number };

type SnapshotOptions<Entry> = {
  name: string;
  rowsKey: string;
  identityName: string;
  normalizeEntry: (value: unknown, invalid: (reason: string) => never) => Entry;
  identity: (entry: Entry) => number;
  onPage?: (progress: SnapshotProgress) => void;
};

export function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

export function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

// No consumer receives rows until every advertised page and unique identity is covered.
export async function fetchCompleteSnapshot<Entry>(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  perPage: number,
  options: SnapshotOptions<Entry>,
): Promise<Entry[]> {
  function invalid(reason: string): never {
    throw new Error(`Invalid Discogs ${options.name} snapshot: ${reason}`);
  }

  function normalizePage(payload: unknown, expectedPage: number) {
    const source = record(payload);
    const pagination = record(source?.pagination);
    const rows = source?.[options.rowsKey];
    if (!pagination || !Array.isArray(rows)) {
      return invalid(`missing pagination or ${options.rowsKey} array`);
    }

    const { page, per_page: pageSize, pages, items } = pagination;
    if (!integer(page, 1) || page !== expectedPage || !integer(pageSize, 1) || pageSize !== perPage
      || !integer(pages, 0) || !integer(items, 0)) {
      return invalid('invalid page, per_page, pages or items metadata');
    }

    const coherentPages = items === 0 ? pages === 0 || pages === 1 : pages === Math.ceil(items / pageSize);
    if (!coherentPages || (items > 0 && page > pages)) {
      return invalid('inconsistent page count');
    }

    const expectedRows = Math.min(pageSize, Math.max(0, items - (page - 1) * pageSize));
    if (rows.length !== expectedRows) {
      return invalid('incomplete or excessive page coverage');
    }

    return {
      pagination: { pages, items },
      rows: rows.map(value => options.normalizeEntry(value, invalid)),
    };
  }

  if (!integer(perPage, 1)) return invalid('invalid requested page size');
  const first = normalizePage(await fetchPage(1, perPage), 1);
  const { pages, items } = first.pagination;
  const entries: Entry[] = [];
  const identities = new Set<number>();

  function append(rows: Entry[]) {
    for (const entry of rows) {
      const id = options.identity(entry);
      if (identities.has(id)) return invalid(`duplicate ${options.identityName} identity`);
      identities.add(id);
      entries.push(entry);
    }
  }

  append(first.rows);
  options.onPage?.({ page: 1, pages, items, current: entries.length });
  for (let page = 2; page <= pages; page += 1) {
    const next = normalizePage(await fetchPage(page, perPage), page);
    if (next.pagination.pages !== pages || next.pagination.items !== items) {
      return invalid('pagination changed during traversal');
    }
    append(next.rows);
    options.onPage?.({ page, pages, items, current: entries.length });
  }

  if (entries.length !== items) return invalid('incomplete total coverage');
  return entries;
}
