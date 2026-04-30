import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CollectionTable from '../components/CollectionTable';
import ColumnToggle from '../components/ColumnToggle';
import ExportButton from '../components/ExportButton';
import ImportButton from '../components/ImportButton';
import FilterPanel from '../components/FilterPanel';
import { CollectionSkeleton } from '../components/LoadingSkeletons';
import SearchBar from '../components/SearchBar';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_VISIBLE, COLUMNS, MANDATORY } from '../lib/columns';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import { applyOptimisticReleasePatch } from '../lib/releaseEdits';
import { COLLECTION_FILTER_KEYS, createCollectionFilters, getActiveCollectionFilters } from '../../shared/collectionFilters.js';
import {
  COLLECTION_SAVED_VIEWS_KEY,
  MAX_COLLECTION_SAVED_VIEWS,
  normalizeCollectionSavedView,
  normalizeCollectionSavedViews
} from '../../shared/contracts/collectionViews.js';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../shared/currency';

const CURRENCY_LABELS = {
  EUR: 'EUR · €',
  USD: 'USD · $',
  GBP: 'GBP · £'
};

function createSavedViewId(name, existingViews) {
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
  const [filters, setFilters] = useState(() => createCollectionFilters(searchParams));
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('artist');
  const [sortOrder, setSortOrder] = useState('asc');
  const [payload, setPayload] = useState({ releases: [], pagination: {}, filters: {} });
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [selectedSavedViewId, setSelectedSavedViewId] = useState('');
  const saveColumnsTimer = useRef(null);
  const [displayCurrency, setDisplayCurrency] = useState(currency || DEFAULT_CURRENCY);

  useEffect(() => {
    setDisplayCurrency(currency || DEFAULT_CURRENCY);
  }, [currency]);

  async function load(nextPage = page, nextFilters = filters, nextSortBy = sortBy, nextSortOrder = sortOrder, nextCurrency = displayCurrency) {
    try {
      setLoading(true);
      const response = await api.getCollection({
        ...nextFilters,
        page: nextPage,
        limit: 20,
        sortBy: nextSortBy,
        sortOrder: nextSortOrder,
        currency: nextCurrency
      });
      setPayload(response);
    } catch (error) {
      toast.error(t('collection.loadError', { error: error.message }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.getPreference('collection_visible_columns').then(({ value }) => {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setVisibleColumns(parsed);
          }
        } catch {}
      }
    }).catch(() => {});

    api.getPreference(COLLECTION_SAVED_VIEWS_KEY).then(({ value }) => {
      setSavedViews(normalizeCollectionSavedViews(value));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [page, sortBy, sortOrder, displayCurrency]);

  useEffect(() => {
    const nextFilters = createCollectionFilters(searchParams);
    const filtersChanged = COLLECTION_FILTER_KEYS.some((key) => filters[key] !== nextFilters[key]);

    if (!filtersChanged) {
      return;
    }

    setFilters(nextFilters);
    setPage(1);
    load(1, nextFilters, sortBy, sortOrder, displayCurrency);
  }, [searchParams]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  function syncFilterParams(nextFilters) {
    setSearchParams(new URLSearchParams(getActiveCollectionFilters(nextFilters)));
  }

  function handleFilterChange(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(1);
    syncFilterParams(next);
    load(1, next, sortBy, sortOrder, displayCurrency);
  }

  async function handleCurrencyChange(nextCurrency) {
    setDisplayCurrency(nextCurrency);

    try {
      await setCurrencyPreference(nextCurrency);
    } catch (error) {
      toast.error(t('collection.loadError', { error: error.message }));
    }
  }

  function handleSort(column) {
    const nextOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(nextOrder);
  }

  function handleColumnToggle(columnId) {
    setVisibleColumns((prev) => {
      const next = prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId];
      clearTimeout(saveColumnsTimer.current);
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
  }

  async function persistSavedViews(nextViews, successKey) {
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
      toast.error(t('collection.savedViewSaveError', { error: error.message }));
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

  function handleApplySavedView(viewId) {
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) {
      return;
    }

    const nextVisibleColumns = view.visibleColumns.length ? view.visibleColumns : DEFAULT_VISIBLE;
    setSelectedSavedViewId(view.id);
    setFilters(view.filters);
    setPage(1);
    setSortBy(view.sortBy);
    setSortOrder(view.sortOrder);
    setVisibleColumns(nextVisibleColumns);
    syncFilterParams(view.filters);
    load(1, view.filters, view.sortBy, view.sortOrder, displayCurrency);
  }

  async function handleDeleteSavedView() {
    if (!selectedSavedViewId) {
      return;
    }

    const nextViews = savedViews.filter((view) => view.id !== selectedSavedViewId);
    await persistSavedViews(nextViews, 'collection.savedViewDeleted');
    setSelectedSavedViewId('');
  }

  async function handleUpdate(release, patch) {
    const previous = payload.releases;
    const optimistic = previous.map((item) => {
      if (item.id !== release.id) {
        return item;
      }

      return applyOptimisticReleasePatch(item, patch).nextRelease;
    });

    setPayload((current) => ({ ...current, releases: optimistic }));

    try {
      const { nextPatch } = applyOptimisticReleasePatch(release, patch);
      const updated = await api.updateRelease(release.id, nextPatch);
      setPayload((current) => ({
        ...current,
        releases: current.releases.map((item) => (item.id === updated.id ? updated : item))
      }));
    } catch (error) {
      setPayload((current) => ({ ...current, releases: previous }));
      toast.error(t('collection.saveError', { error: error.message }));
    }
  }

  const totalLabel = t('collection.results', { count: formatNumber(payload.pagination.total || 0) });
  const filterLabel = activeFilterCount
    ? t('collection.activeFilters', { count: formatNumber(activeFilterCount) })
    : t('collection.noFilters');

  return (
    <div className="space-y-6">
      <section className="glass-panel relative flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('collection.eyebrow')}</p>
          <h2 className="mt-2 font-display text-4xl text-white">{t('collection.title')}</h2>
          <p className="mt-2 text-sm text-slate-300">
            {totalLabel} {filterLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span className="text-xs uppercase tracking-[0.25em] text-slate-400">{t('collection.currency')}</span>
            <select
              value={displayCurrency}
              onChange={(event) => handleCurrencyChange(event.target.value)}
              className="bg-transparent text-sm text-slate-100 outline-none"
            >
              {SUPPORTED_CURRENCIES.map((option) => (
                <option key={option} value={option} className="bg-slate-950 text-slate-100">
                  {CURRENCY_LABELS[option] || option}
                </option>
              ))}
            </select>
          </label>
          <ColumnToggle visibleColumns={visibleColumns} onToggle={handleColumnToggle} />
          <ExportButton filters={{ ...filters, currency: displayCurrency }} disabled={!discogsConfigured} />
        </div>
      </section>

      <ImportButton disabled={!discogsConfigured} />

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

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <SearchBar value={filters.search} onChange={(value) => handleFilterChange('search', value)} />
      </div>

      <FilterPanel
        filters={filters}
        options={payload.filters}
        onChange={handleFilterChange}
        onReset={() => {
          const resetFilters = createCollectionFilters();
          setFilters(resetFilters);
          setPage(1);
          syncFilterParams(resetFilters);
          load(1, resetFilters, sortBy, sortOrder, displayCurrency);
        }}
      />

      <section className="glass-panel flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{t('collection.savedViews')}</p>
          <p className="mt-1 text-sm text-slate-300">{t('collection.savedViewsHint')}</p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <select
            value={selectedSavedViewId}
            onChange={(event) => setSelectedSavedViewId(event.target.value)}
            className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-300"
          >
            <option value="">{savedViews.length ? t('collection.savedViewsPlaceholder') : t('collection.savedViewsEmpty')}</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id} className="bg-slate-950 text-slate-100">
                {view.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApplySavedView(selectedSavedViewId)}
              disabled={!selectedSavedViewId}
              className="secondary-button disabled:opacity-50"
            >
              {t('collection.applySavedView')}
            </button>
            <button
              type="button"
              onClick={handleDeleteSavedView}
              disabled={!selectedSavedViewId}
              className="secondary-button disabled:opacity-50"
            >
              {t('collection.deleteSavedView')}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={savedViewName}
              onChange={(event) => setSavedViewName(event.target.value)}
              placeholder={t('collection.savedViewName')}
              maxLength={48}
              className="min-w-0 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-brand-300"
            />
            <button type="button" onClick={handleSaveCurrentView} className="primary-button">
              {t('collection.saveSavedView')}
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <CollectionSkeleton />
      ) : (
        <CollectionTable releases={payload.releases} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} onUpdate={handleUpdate} visibleColumns={[...new Set([...MANDATORY, ...visibleColumns])]} currency={displayCurrency} />
      )}

      <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          {t('collection.page', { page: payload.pagination.page || 1, total: payload.pagination.totalPages || 1 })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={(payload.pagination.page || 1) <= 1}
            className="secondary-button disabled:opacity-50"
          >
            {t('collection.previous')}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(payload.pagination.totalPages || current, current + 1))}
            disabled={(payload.pagination.page || 1) >= (payload.pagination.totalPages || 1)}
            className="primary-button disabled:opacity-50"
          >
            {t('collection.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Collection;
