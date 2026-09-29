import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import CollectionTable, { type SortOrder, type TableSortColumn } from '../components/CollectionTable';
import ReleaseGrid from '../components/ReleaseGrid';
import Icon from '../components/Icon';
import ColumnToggle from '../components/ColumnToggle';
import ExportButton from '../components/ExportButton';
import ImportButton from '../components/ImportButton';
import FilterPanel from '../components/FilterPanel';
import { CollectionSkeleton } from '../components/LoadingSkeletons';
import SearchBar from '../components/SearchBar';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_VISIBLE, COLUMNS, type ColumnId } from '../lib/columns';
import { buildCollectionTableVisibleColumns, COLLECTION_PAGE_LIMIT } from '../lib/collectionTableState';
import { getErrorMessage } from '../lib/errors';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import { applyOptimisticReleasePatch } from '../lib/releaseEdits';
import { COLLECTION_FILTER_KEYS, createCollectionFilters, getActiveCollectionFilters, UNGRADED_CONDITION } from '../../shared/collectionFilters.js';
import type { CollectionFilters } from '../../shared/collectionFilters.js';
import type { CollectionRelease } from '../../shared/contracts/release.js';
import {
  COLLECTION_SAVED_VIEWS_KEY,
  MAX_COLLECTION_SAVED_VIEWS,
  type CollectionSavedView,
  normalizeCollectionSavedView,
  normalizeCollectionSavedViews
} from '../../shared/contracts/collectionViews.js';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, type Currency } from '../../shared/currency.js';
import type { CollectionPageResponse, FilterKey, UpdateReleasePatch } from '../lib/types';

type ViewMode = 'grid' | 'table';

const VIEW_MODE_KEY = 'collection_view_mode';
const SEARCH_DEBOUNCE_MS = 300;
const SORT_OPTIONS: Array<{ value: TableSortColumn; labelKey: string; defaultOrder: SortOrder }> = [
  { value: 'artist', labelKey: 'collection.artist', defaultOrder: 'asc' },
  { value: 'title', labelKey: 'collection.titleColumn', defaultOrder: 'asc' },
  { value: 'date_added', labelKey: 'collection.sortRecent', defaultOrder: 'desc' },
  { value: 'year', labelKey: 'collection.year', defaultOrder: 'desc' },
  { value: 'rating', labelKey: 'collection.rating', defaultOrder: 'desc' },
  { value: 'estimated_value', labelKey: 'collection.price', defaultOrder: 'desc' },
  { value: 'community_want', labelKey: 'collection.demand', defaultOrder: 'desc' },
];
const SORT_COLUMNS = new Set<string>([...SORT_OPTIONS.map((option) => option.value), 'listing_price_eur', 'community_have']);

function readSort(params: URLSearchParams): { sortBy: TableSortColumn; sortOrder: SortOrder; page: number } {
  const sortBy = SORT_COLUMNS.has(params.get('sort') || '') ? params.get('sort') as TableSortColumn : 'artist';
  const sortOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  return { sortBy, sortOrder, page };
}

function buildSearchParams(filters: CollectionFilters, sortBy: TableSortColumn, sortOrder: SortOrder, page: number): URLSearchParams {
  const params = new URLSearchParams(getActiveCollectionFilters(filters));
  if (sortBy !== 'artist' || sortOrder !== 'asc') {
    params.set('sort', sortBy);
    params.set('order', sortOrder);
  }
  if (page > 1) {
    params.set('page', String(page));
  }
  return params;
}

const CURRENCY_LABELS = {
  EUR: 'EUR · €',
  USD: 'USD · $',
  GBP: 'GBP · £'
};

function createSavedViewId(name: string, existingViews: CollectionSavedView[]): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'view';
  const usedIds = new Set(existingViews.map((view) => view.id));

  if (!usedIds.has(base)) {
    return base;
  }

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function Collection() {
  const { accountUnavailable, discogsConfigured, currency, setCurrencyPreference } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSort = readSort(searchParams);
  const [filters, setFilters] = useState<CollectionFilters>(() => createCollectionFilters(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => createCollectionFilters(searchParams).search);
  const [page, setPage] = useState(initialSort.page);
  const [sortBy, setSortBy] = useState<TableSortColumn>(initialSort.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSort.sortOrder);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [payload, setPayload] = useState<CollectionPageResponse>({
    releases: [],
    displayCurrency: DEFAULT_CURRENCY,
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    },
    filters: {
      genres: [],
      styles: [],
      decades: [],
      formats: [],
      labels: [],
    },
  });
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  const [savedViews, setSavedViews] = useState<CollectionSavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [selectedSavedViewId, setSelectedSavedViewId] = useState('');
  const saveColumnsTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const collectionLoadSequence = useRef(0);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(currency || DEFAULT_CURRENCY);

  useEffect(() => {
    setDisplayCurrency(currency || DEFAULT_CURRENCY);
  }, [currency]);

  const load = useCallback(async (
    nextPage = page,
    nextFilters = filters,
    nextSortBy = sortBy,
    nextSortOrder = sortOrder,
    nextCurrency = displayCurrency,
  ): Promise<void> => {
    const requestSequence = collectionLoadSequence.current + 1;
    collectionLoadSequence.current = requestSequence;

    try {
      setLoading(true);
      const response = await api.getCollection({
        ...nextFilters,
        page: nextPage,
        limit: COLLECTION_PAGE_LIMIT,
        sortBy: nextSortBy,
        sortOrder: nextSortOrder,
        currency: nextCurrency
      });
      if (collectionLoadSequence.current === requestSequence) {
        setPayload(response);
      }
    } catch (error) {
      if (collectionLoadSequence.current === requestSequence) {
        toast.error(t('collection.loadError', { error: getErrorMessage(error, t('client.networkError')) }));
      }
    } finally {
      if (collectionLoadSequence.current === requestSequence) {
        setLoading(false);
      }
    }
  }, [displayCurrency, filters, page, sortBy, sortOrder, t, toast]);

  useEffect(() => {
    api.getPreference('collection_visible_columns').then(({ value }) => {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setVisibleColumns(parsed);
          }
        } catch {
          return;
        }
      }
    }).catch(() => {});

    api.getPreference(COLLECTION_SAVED_VIEWS_KEY).then(({ value }) => {
      setSavedViews(normalizeCollectionSavedViews(value));
    }).catch(() => {});

    api.getPreference(VIEW_MODE_KEY).then(({ value }) => {
      if (value === 'grid' || value === 'table') {
        setViewMode(value);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [page, sortBy, sortOrder, displayCurrency]);

  // Keep the URL in sync so Back from a release detail returns to the same page, sort and filters.
  // `replace` avoids one history entry per keystroke or click.
  useEffect(() => {
    const next = buildSearchParams(filters, sortBy, sortOrder, page);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, page, sortBy, sortOrder]);

  // External navigation (e.g. a dashboard chart link) changes the URL filters.
  useEffect(() => {
    const nextFilters = createCollectionFilters(searchParams);
    const filtersChanged = COLLECTION_FILTER_KEYS.some((key) => filters[key] !== nextFilters[key]);

    if (!filtersChanged) {
      return;
    }

    setFilters(nextFilters);
    setSearchDraft(nextFilters.search);
    setPage(1);
    load(1, nextFilters, sortBy, sortOrder, displayCurrency);
  }, [searchParams]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  const applyFilters = useCallback((next: CollectionFilters) => {
    setFilters(next);
    setPage(1);
    load(1, next, sortBy, sortOrder, displayCurrency);
  }, [displayCurrency, load, sortBy, sortOrder]);

  const handleFilterChange = useCallback((key: FilterKey, value: string) => {
    applyFilters({ ...filters, [key]: value });
  }, [applyFilters, filters]);

  // The debounced search runs later, so it reads the latest filters/handler through a ref instead of
  // the ones captured when typing started (which would drop a filter picked in the meantime).
  const latestSearchApply = useRef<(search: string) => void>(() => {});
  latestSearchApply.current = (search: string) => {
    if (search !== filters.search) {
      applyFilters({ ...filters, search });
    }
  };

  useEffect(() => {
    if (searchDraft.trim() === filters.search) {
      return undefined;
    }

    const timer = window.setTimeout(() => latestSearchApply.current(searchDraft.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const handleCurrencyChange = useCallback(async (nextCurrency: Currency) => {
    setDisplayCurrency(nextCurrency);

    try {
      await setCurrencyPreference(nextCurrency);
    } catch (error) {
      toast.error(t('collection.loadError', { error: getErrorMessage(error, t('client.networkError')) }));
    }
  }, [setCurrencyPreference, t, toast]);

  const handleSort = useCallback((column: TableSortColumn) => {
    const nextOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(nextOrder);
    setPage(1);
  }, [sortBy, sortOrder]);

  const handleSortSelect = useCallback((column: TableSortColumn) => {
    const option = SORT_OPTIONS.find((item) => item.value === column);
    setSortBy(column);
    setSortOrder(option?.defaultOrder ?? 'asc');
    setPage(1);
  }, []);

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    api.setPreference(VIEW_MODE_KEY, mode).catch(() => {});
  }, []);

  const handleColumnToggle = useCallback((columnId: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId];
      if (saveColumnsTimer.current) {
        clearTimeout(saveColumnsTimer.current);
      }
      saveColumnsTimer.current = setTimeout(() => {
        api.setPreference('collection_visible_columns', JSON.stringify(next)).catch(() => {});
      }, 500);

      // If the currently sorted column is being hidden, reset sort to artist
      const hiddenColumnDef = COLUMNS.find((c) => c.id === columnId);
      if (hiddenColumnDef?.sortColumn === sortBy && !next.includes(columnId)) {
        setSortBy('artist');
        setSortOrder('asc');
        toast.info(t('collection.sortReset'));
      }

      return next;
    });
  }, [sortBy, t, toast]);

  async function persistSavedViews(nextViews: CollectionSavedView[], successKey?: string) {
    const previousViews = savedViews;
    const normalizedViews = normalizeCollectionSavedViews(nextViews);
    setSavedViews(normalizedViews);

    try {
      await api.setPreference(COLLECTION_SAVED_VIEWS_KEY, JSON.stringify(normalizedViews));
      if (successKey) {
        toast.success(t(successKey));
      }
      return normalizedViews;
    } catch (error) {
      setSavedViews(previousViews);
      toast.error(t('collection.savedViewSaveError', { error: getErrorMessage(error, t('client.networkError')) }));
      return previousViews;
    }
  }

  async function handleSaveCurrentView() {
    const name = savedViewName.trim();
    if (!name) {
      toast.error(t('collection.savedViewNameRequired'));
      return;
    }

    const nextView = normalizeCollectionSavedView({
      id: createSavedViewId(name, savedViews),
      name,
      filters,
      sortBy,
      sortOrder,
      visibleColumns
    });

    if (!nextView) {
      toast.error(t('collection.savedViewNameRequired'));
      return;
    }

    const nextViews = [nextView, ...savedViews].slice(0, MAX_COLLECTION_SAVED_VIEWS);
    await persistSavedViews(nextViews, 'collection.savedViewSaved');
    setSelectedSavedViewId(nextView.id);
    setSavedViewName('');
  }

  const handleApplySavedView = useCallback((viewId: string) => {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }

    const nextVisibleColumns = view.visibleColumns.length ? view.visibleColumns : DEFAULT_VISIBLE;
    setSelectedSavedViewId(view.id);
    setFilters(view.filters);
    setSearchDraft(view.filters.search);
    setPage(1);
    setSortBy(view.sortBy as TableSortColumn);
    setSortOrder(view.sortOrder as SortOrder);
    setVisibleColumns(nextVisibleColumns as ColumnId[]);
    load(1, view.filters, view.sortBy as TableSortColumn, view.sortOrder as SortOrder, displayCurrency);
  }, [displayCurrency, load, savedViews]);

  async function handleDeleteSavedView() {
    if (!selectedSavedViewId) {
      return;
    }

    const nextViews = savedViews.filter((view) => view.id !== selectedSavedViewId);
    await persistSavedViews(nextViews, 'collection.savedViewDeleted');
    setSelectedSavedViewId('');
  }

  const handleUpdate = useCallback(async (release: CollectionRelease, patch: UpdateReleasePatch) => {
    const { nextPatch, nextRelease } = applyOptimisticReleasePatch(release, patch);
    const replaceRow = (replacement: CollectionRelease) => (current: CollectionPageResponse) => ({
      ...current,
      releases: current.releases.map((item) => (item.id === replacement.id ? replacement : item))
    });

    setPayload(replaceRow(nextRelease));

    try {
      const updated = await api.updateRelease(release.id ?? '', nextPatch);
      setPayload(replaceRow(updated));
    } catch (error) {
      // Only this row is restored, from the server when possible, so other edits made meanwhile survive.
      setPayload(replaceRow(await api.getRelease(release.id ?? '').catch(() => release)));
      toast.error(t('collection.saveError', { error: getErrorMessage(error, t('client.networkError')) }));
    }
  }, [t, toast]);

  const resetFilters = useCallback(() => {
    setSearchDraft('');
    applyFilters(createCollectionFilters());
  }, [applyFilters]);

  const folderNames = useMemo(
    () => new Map((payload.filters.folders || []).map((folder) => [String(folder.id), folder.name])),
    [payload.filters.folders]
  );

  const activeChips = useMemo(() => COLLECTION_FILTER_KEYS
    .filter((key) => filters[key])
    .map((key) => {
      const value = filters[key];
      let label = value;
      if (key === 'decade') label = `${value}s`;
      if (key === 'folder') label = folderNames.get(value) || value;
      if (key === 'condition') label = value === UNGRADED_CONDITION ? t('condition.ungraded') : value;
      if (key === 'search') label = `“${value}”`;
      return { key, label };
    }), [filters, folderNames, t]);

  const totalLabel = t('collection.results', { count: formatNumber(payload.pagination.total || 0) });
  const tableVisibleColumns = useMemo(
    () => buildCollectionTableVisibleColumns(visibleColumns),
    [visibleColumns]
  );
  const currentPage = payload.pagination.page || 1;
  const totalPages = payload.pagination.totalPages || 1;

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{t('collection.eyebrow')}</p>
          <h2 className="page-title">{t('collection.title')}</h2>
          <p className="mt-1.5 text-sm text-slate-400">
            {totalLabel} {activeFilterCount ? t('collection.activeFilters', { count: formatNumber(activeFilterCount) }) : t('collection.noFilters')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-slate-200">
            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{t('collection.currency')}</span>
            <select
              value={displayCurrency}
              onChange={(event) => handleCurrencyChange(event.target.value as Currency)}
              className="bg-transparent text-sm text-slate-100 outline-hidden"
            >
              {SUPPORTED_CURRENCIES.map((option) => (
                <option key={option} value={option} className="bg-slate-950 text-slate-100">
                  {CURRENCY_LABELS[option] || option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setImportOpen((open) => !open)}
            aria-expanded={importOpen}
            disabled={!discogsConfigured}
            className="secondary-button disabled:opacity-50"
          >
            <Icon name="share" size={16} className="rotate-180" />
            {t('collection.import')}
          </button>
          <ExportButton filters={{ ...filters, currency: displayCurrency }} disabled={!discogsConfigured} />
          <Link to={`/collection/print?${new URLSearchParams(getActiveCollectionFilters(filters)).toString()}`} className="secondary-button">
            <Icon name="printer" size={16} />
            {t('collection.printCatalog')}
          </Link>
        </div>
      </header>

      {importOpen ? (
        <section className="glass-panel p-5">
          <ImportButton disabled={!discogsConfigured} onApplied={() => load()} />
        </section>
      ) : null}

      {accountUnavailable ? (
        <div className="glass-panel p-4 text-sm text-amber-100">
          {t('collection.accountUnavailable')}
        </div>
      ) : null}

      {!discogsConfigured && !accountUnavailable && (
        <div className="glass-panel p-4 text-sm text-slate-300">
          {t('collection.configureAccount')}
        </div>
      )}

      <div className="glass-panel z-20 flex md:sticky md:top-[60px] lg:top-4 flex-col gap-2 p-2.5 md:flex-row md:items-center">
        <SearchBar value={searchDraft} onChange={setSearchDraft} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="collection-filters"
            className={`secondary-button ${activeFilterCount ? 'border-brand-300/40' : ''}`}
          >
            <Icon name="filter" size={16} />
            {t('collection.filtersTitle')}
            {activeFilterCount ? <span className="rounded-full bg-brand-400 px-1.5 text-xs text-white">{activeFilterCount}</span> : null}
          </button>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm">
            <span className="sr-only">{t('collection.sortBy')}</span>
            <select
              value={sortBy}
              onChange={(event) => handleSortSelect(event.target.value as TableSortColumn)}
              className="bg-transparent text-slate-100 outline-hidden"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-950">{t(option.labelKey)}</option>
              ))}
              {!SORT_OPTIONS.some((option) => option.value === sortBy) ? <option value={sortBy} className="bg-slate-950">{t('collection.listingPrice')}</option> : null}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => { setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc')); setPage(1); }}
            aria-label={sortOrder === 'asc' ? t('collection.sortAscending') : t('collection.sortDescending')}
            title={sortOrder === 'asc' ? t('collection.sortAscending') : t('collection.sortDescending')}
          >
            <span aria-hidden="true" className="text-base leading-none">{sortOrder === 'asc' ? '↑' : '↓'}</span>
          </button>
          <div className="segmented" role="group" aria-label={t('collection.viewMode')}>
            <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => handleViewMode('grid')} title={t('collection.viewGrid')}>
              <Icon name="grid" size={16} /><span className="hidden sm:inline">{t('collection.viewGrid')}</span>
            </button>
            <button type="button" aria-pressed={viewMode === 'table'} onClick={() => handleViewMode('table')} title={t('collection.viewTable')}>
              <Icon name="list" size={16} /><span className="hidden sm:inline">{t('collection.viewTable')}</span>
            </button>
          </div>
          {viewMode === 'table' ? <ColumnToggle visibleColumns={visibleColumns} onToggle={handleColumnToggle} /> : null}
        </div>
      </div>

      {filtersOpen ? (
        <div id="collection-filters" className="space-y-3">
          <FilterPanel
            filters={filters}
            options={payload.filters}
            onChange={handleFilterChange}
            onReset={resetFilters}
          />

          <section className="glass-panel flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{t('collection.savedViews')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('collection.savedViewsHint')}</p>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <select
                value={selectedSavedViewId}
                onChange={(event) => setSelectedSavedViewId(event.target.value)}
                aria-label={t('collection.savedViews')}
                className="field-input lg:w-56"
              >
                <option value="">{savedViews.length ? t('collection.savedViewsPlaceholder') : t('collection.savedViewsEmpty')}</option>
                {savedViews.map((view) => (
                  <option key={view.id} value={view.id} className="bg-slate-950 text-slate-100">
                    {view.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleApplySavedView(selectedSavedViewId)} disabled={!selectedSavedViewId} className="secondary-button disabled:opacity-50">
                  {t('collection.applySavedView')}
                </button>
                <button type="button" onClick={handleDeleteSavedView} disabled={!selectedSavedViewId} className="secondary-button disabled:opacity-50">
                  {t('collection.deleteSavedView')}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={savedViewName}
                  onChange={(event) => setSavedViewName(event.target.value)}
                  placeholder={t('collection.savedViewName')}
                  aria-label={t('collection.savedViewName')}
                  maxLength={48}
                  className="field-input min-w-0"
                />
                <button type="button" onClick={handleSaveCurrentView} className="primary-button">
                  {t('collection.saveSavedView')}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeChips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <span key={chip.key} className="filter-chip">
              <span className="text-brand-200/70">{t(`collection.${chip.key === 'search' ? 'searchLabel' : chip.key}`)}:</span>
              {chip.label}
              <button
                type="button"
                onClick={() => {
                  if (chip.key === 'search') setSearchDraft('');
                  handleFilterChange(chip.key, '');
                }}
                aria-label={t('collection.removeFilter', { filter: chip.label })}
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          <button type="button" onClick={resetFilters} className="text-sm text-brand-200 hover:text-brand-100">
            {t('collection.clearFilters')}
          </button>
        </div>
      ) : null}

      {loading ? (
        <CollectionSkeleton />
      ) : !payload.releases.length ? (
        <div className="glass-panel flex flex-col items-center gap-3 p-12 text-center">
          <Icon name="disc" size={40} className="text-slate-600" />
          <p className="font-display text-xl text-white">{t('collection.emptyTitle')}</p>
          <p className="max-w-md text-sm text-slate-400">{activeFilterCount ? t('collection.emptyFiltered') : t('collection.emptyBody')}</p>
          {activeFilterCount ? <button type="button" className="secondary-button" onClick={resetFilters}>{t('collection.clearFilters')}</button> : null}
        </div>
      ) : viewMode === 'grid' ? (
        <ReleaseGrid releases={payload.releases} currency={displayCurrency} />
      ) : (
        <CollectionTable releases={payload.releases} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} onUpdate={handleUpdate} visibleColumns={tableVisibleColumns} currency={displayCurrency} />
      )}

      <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label={t('collection.pagination')}>
        <p className="text-sm text-slate-400">
          {t('collection.page', { page: currentPage, total: totalPages })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
            className="secondary-button disabled:opacity-50"
          >
            <Icon name="chevronLeft" size={16} />
            {t('collection.previous')}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages || current, current + 1))}
            disabled={currentPage >= totalPages}
            className="primary-button disabled:opacity-50"
          >
            {t('collection.next')}
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </nav>
    </div>
  );
}

export default Collection;
