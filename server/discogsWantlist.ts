type UnknownRecord = Record<string, unknown>;

export type DiscogsWantlistEntry = UnknownRecord & { id: number };

type WantlistPagination = {
  page: number;
  perPage: number;
  pages: number;
  items: number;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function invalidSnapshot(reason: string): never {
  throw new Error(`Invalid Discogs Wantlist snapshot: ${reason}`);
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function normalizeEntry(value: unknown): DiscogsWantlistEntry {
  const source = record(value);
  if (!source) return invalidSnapshot('invalid Wantlist entry');

  const basicId = record(source.basic_information)?.id;
  const id = source.id ?? basicId;
  if (!integer(id, 1) || (source.id !== undefined && !integer(source.id, 1))
    || (basicId !== undefined && (!integer(basicId, 1) || basicId !== id))) {
    return invalidSnapshot('invalid or conflicting release identity');
  }

  return { ...source, id };
}

function normalizePage(payload: unknown, expectedPage: number, perPage: number) {
  const source = record(payload);
  const pagination = record(source?.pagination);
  if (!pagination || !Array.isArray(source?.wants)) {
    return invalidSnapshot('missing pagination or wants array');
  }

  const { page, per_page: pageSize, pages, items } = pagination;
  if (!integer(page, 1) || page !== expectedPage || !integer(pageSize, 1) || pageSize !== perPage
    || !integer(pages, 0) || !integer(items, 0)) {
    return invalidSnapshot('invalid page, per_page, pages or items metadata');
  }

  const coherentPages = items === 0 ? pages === 0 || pages === 1 : pages === Math.ceil(items / pageSize);
  if (!coherentPages || (items > 0 && page > pages)) {
    return invalidSnapshot('inconsistent page count');
  }

  const expectedRows = Math.min(pageSize, Math.max(0, items - (page - 1) * pageSize));
  if (source.wants.length !== expectedRows) {
    return invalidSnapshot('incomplete or excessive page coverage');
  }

  return {
    pagination: { page, perPage: pageSize, pages, items } satisfies WantlistPagination,
    wants: source.wants.map(normalizeEntry),
  };
}

// Reconciliation receives rows only after every advertised page has been validated.
export async function fetchCompleteWantlist(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  perPage: number,
): Promise<DiscogsWantlistEntry[]> {
  if (!integer(perPage, 1)) return invalidSnapshot('invalid requested page size');

  const first = normalizePage(await fetchPage(1, perPage), 1, perPage);
  const { pages, items } = first.pagination;
  const wants: DiscogsWantlistEntry[] = [];
  const releaseIds = new Set<number>();

  function append(entries: DiscogsWantlistEntry[]) {
    for (const entry of entries) {
      if (releaseIds.has(entry.id)) return invalidSnapshot('duplicate release identity');
      releaseIds.add(entry.id);
      wants.push(entry);
    }
  }

  append(first.wants);
  for (let page = 2; page <= pages; page += 1) {
    const next = normalizePage(await fetchPage(page, perPage), page, perPage);
    if (next.pagination.pages !== pages || next.pagination.items !== items) {
      return invalidSnapshot('pagination changed during traversal');
    }
    append(next.wants);
  }

  if (wants.length !== items) return invalidSnapshot('incomplete total coverage');
  return wants;
}
