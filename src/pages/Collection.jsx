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

const DEFAULT_FILTERS = {
  search: '',
  genre: '',
  style: '',
  decade: '',
  format: '',
  label: ''
};

function getFiltersFromSearchParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    genre: searchParams.get('genre') || '',
    style: searchParams.get('style') || '',
    decade: searchParams.get('decade') || '',
    format: searchParams.get('format') || '',
    label: searchParams.get('label') || ''
  };
}

function Collection() {
  const { discogsConfigured, currency } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => getFiltersFromSearchParams(searchParams));
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('artist');
  const [sortOrder, setSortOrder] = useState('asc');
  const [payload, setPayload] = useState({ releases: [], pagination: {}, filters: {} });
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  const saveColumnsTimer = useRef(null);

  async function load(nextPage = page, nextFilters = filters, nextSortBy = sortBy, nextSortOrder = sortOrder) {
    try {
      setLoading(true);
      const response = await api.getCollection({
        ...nextFilters,
        page: nextPage,
        limit: 20,
        sortBy: nextSortBy,
        sortOrder: nextSortOrder
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
  }, []);

  useEffect(() => {
    load();
  }, [page, sortBy, sortOrder]);

  useEffect(() => {
    const nextFilters = getFiltersFromSearchParams(searchParams);
    const filtersChanged = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== nextFilters[key]);

    if (!filtersChanged) {
      return;
    }

    setFilters(nextFilters);
    setPage(1);
    load(1, nextFilters, sortBy, sortOrder);
  }, [searchParams]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  function syncFilterParams(nextFilters) {
    const nextParams = new URLSearchParams();

    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) {
        nextParams.set(key, value);
      }
    }

    setSearchParams(nextParams);
  }

  function handleFilterChange(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(1);
    syncFilterParams(next);
    load(1, next, sortBy, sortOrder);
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

  async function handleUpdate(release, patch) {
    const previous = payload.releases;
    const optimistic = previous.map((item) => {
      if (item.id !== release.id) {
        return item;
      }

      const next = { ...item };
      if (patch.rating !== undefined) {
        next.rating = patch.rating;
      }
      if (patch.notes !== undefined) {
        next.notes_text = patch.notes;
        next.notes = patch.notes ? [{ field_id: null, value: patch.notes }] : [];
      }
      return next;
    });

    setPayload((current) => ({ ...current, releases: optimistic }));

    try {
      const updated = await api.updateRelease(release.id, patch);
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
        <div className="flex gap-2">
          <ColumnToggle visibleColumns={visibleColumns} onToggle={handleColumnToggle} />
          <ExportButton filters={filters} disabled={!discogsConfigured} />
        </div>
      </section>

      <ImportButton disabled={!discogsConfigured} />

      {!discogsConfigured && (
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
          setFilters(DEFAULT_FILTERS);
          setPage(1);
          syncFilterParams(DEFAULT_FILTERS);
          load(1, DEFAULT_FILTERS, sortBy, sortOrder);
        }}
      />

      {loading ? (
        <CollectionSkeleton />
      ) : (
        <CollectionTable releases={payload.releases} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} onUpdate={handleUpdate} visibleColumns={[...new Set([...MANDATORY, ...visibleColumns])]} currency={currency} />
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
