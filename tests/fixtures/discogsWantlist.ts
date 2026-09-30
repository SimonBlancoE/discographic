export function wantlistEntry(id: number) {
  return {
    id,
    rating: 0,
    notes: '',
    date_added: '2026-09-30T10:00:00Z',
    basic_information: {
      id,
      title: `Wanted ${id}`,
      year: 2000,
      artists: [{ id: 1, name: 'Fixture Artist' }],
      labels: [],
      formats: [],
      genres: [],
      styles: [],
      thumb: '',
      cover_image: '',
      resource_url: `https://api.discogs.com/releases/${id}`,
    },
    resource_url: `https://api.discogs.com/users/collector/wants/${id}`,
  };
}

export function wantlistPage(ids: number[], page = 1, perPage = 100, items = ids.length, pages = Math.ceil(items / perPage)) {
  const pageUrl = (target: number) => `https://api.discogs.com/users/collector/wants?page=${target}&per_page=${perPage}&sort=added&sort_order=desc`;
  return {
    pagination: {
      page,
      per_page: perPage,
      items,
      pages,
      urls: {
        ...(page > 1 ? { first: pageUrl(1), prev: pageUrl(page - 1) } : {}),
        ...(page < pages ? { next: pageUrl(page + 1), last: pageUrl(pages) } : {}),
      },
    },
    wants: ids.map(wantlistEntry),
  };
}
