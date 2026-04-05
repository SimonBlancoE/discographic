export const COLUMNS = [
  { id: 'cover',    i18nKey: 'collection.cover',       mandatory: true,  sortable: false },
  { id: 'artist',   i18nKey: 'collection.artist',      mandatory: true,  sortable: true,  sortColumn: 'artist' },
  { id: 'title',    i18nKey: 'collection.titleColumn',  mandatory: true,  sortable: true,  sortColumn: 'title' },
  { id: 'year',     i18nKey: 'collection.year',         mandatory: false, sortable: true,  sortColumn: 'year' },
  { id: 'genre',    i18nKey: 'collection.genre',        mandatory: false, sortable: false },
  { id: 'format',   i18nKey: 'collection.format',       mandatory: false, sortable: false },
  { id: 'label',    i18nKey: 'collection.label',        mandatory: false, sortable: false },
  { id: 'rating',   i18nKey: 'collection.rating',       mandatory: false, sortable: true,  sortColumn: 'rating' },
  { id: 'notes',    i18nKey: 'collection.notes',        mandatory: false, sortable: false },
  { id: 'price',    i18nKey: 'collection.price',        mandatory: false, sortable: true,  sortColumn: 'estimated_value' },
  { id: 'listings', i18nKey: 'collection.listings',     mandatory: false, sortable: true,  sortColumn: 'num_for_sale', defaultHidden: true },
];

export const DEFAULT_VISIBLE = COLUMNS.filter(c => !c.defaultHidden).map(c => c.id);
export const MANDATORY = COLUMNS.filter(c => c.mandatory).map(c => c.id);
