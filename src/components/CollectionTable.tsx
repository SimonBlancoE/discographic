import { Link } from 'react-router';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMarketplaceStatusLabelKey, hasPricedMarketplaceValue } from '../../shared/contracts/marketplace.js';
import type { CollectionRelease } from '../../shared/contracts/release.js';
import type { Currency } from '../../shared/currency.js';
import { formatCompactNumber, formatCurrency, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { COLUMNS, type ColumnId } from '../lib/columns';
import StarRating from './StarRating';
import CoverImage from './CoverImage';
import ConditionBadge from './ConditionBadge';
import type { Translate, UpdateReleasePatch } from '../lib/types';

export type SortOrder = 'asc' | 'desc';

export type TableSortColumn = 'artist' | 'title' | 'year' | 'rating' | 'date_added' | 'estimated_value' | 'listing_price_eur' | 'community_want' | 'community_have';

type SortProps = {
  sortBy: TableSortColumn;
  sortOrder: SortOrder;
  onSort: (column: TableSortColumn) => void;
};

type CellContext = {
  t: Translate;
  onUpdate: (release: CollectionRelease, patch: UpdateReleasePatch) => void;
  currency: Currency;
};

type Renderer = {
  header: (t: Translate, sortProps: SortProps) => ReactNode;
  cell: (release: CollectionRelease, context: CellContext) => ReactNode;
  cellClass?: string;
};

function NotesInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    // A textarea keeps multi-line Discogs notes intact; an <input> would strip the line breaks.
    <textarea
      rows={1}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        // Tabbing through the column must not send one Discogs write per row.
        if (draft.trim() !== value.trim()) {
          onCommit(draft);
        }
      }}
      placeholder={t('collection.notePlaceholder')}
      aria-label={t('collection.notes')}
      className="field-input field-sizing-content max-h-28 min-h-0 resize-none py-1.5 leading-snug"
    />
  );
}

function getSortIndicator(active: boolean, sortOrder: SortOrder): string {
  if (!active) {
    return '↕';
  }

  return sortOrder === 'asc' ? '↑' : '↓';
}

function SortButton({ label, column, sortBy, sortOrder, onSort }: {
  label: string;
  column: TableSortColumn;
  sortBy: TableSortColumn;
  sortOrder: SortOrder;
  onSort: (column: TableSortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <button type="button" onClick={() => onSort(column)} className={`flex items-center gap-1 ${active ? 'text-brand-200' : 'text-slate-300'}`}>
      <span>{label}</span>
      <span>{getSortIndicator(active, sortOrder)}</span>
    </button>
  );
}

function MarketplaceValue({ release, currency, t }: { release: CollectionRelease; currency: Currency; t: Translate }) {
  if (hasPricedMarketplaceValue(release)) {
    return <span className="text-brand-100">{formatCurrency(release.estimated_value, currency)}</span>;
  }

  return <span className="text-xs text-slate-500">{t(getMarketplaceStatusLabelKey(release.marketplace_status))}</span>;
}

const RENDERERS: Record<ColumnId, Renderer> = {
  cover: {
    header: (t) => t('collection.cover'),
    cell: (release, { t }) => {
      const localCoverUrl = release.id && release.cover_url ? `/api/media/cover/${release.id}?variant=wall` : null;
      return (
        <Link to={`/release/${release.id}`} aria-label={`${release.artist} – ${release.title}`} className="cover-peek-trigger relative block h-12 w-12 overflow-visible rounded-xl">
          <span className="block h-12 w-12 overflow-hidden rounded-xl bg-slate-900/80 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
            <CoverImage src={localCoverUrl} fallbackSrc={release.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
          </span>
          {localCoverUrl ? (
            <span className="cover-peek absolute left-16 top-1/2 z-20 hidden w-40 -translate-y-1/2 rounded-2xl border border-white/10 bg-slate-950/90 p-2 shadow-[0_24px_60px_rgba(2,6,23,0.48)] backdrop-blur-xl lg:block">
               <img src={localCoverUrl} alt={t('collection.coverExpanded', { title: release.title })} className="aspect-square w-full rounded-[16px] object-cover" />
            </span>
          ) : null}
        </Link>
      );
    },
  },
  artist: {
    header: (t, sortProps) => <SortButton label={t('collection.artist')} column="artist" {...sortProps} />,
    cell: (release) => <span className="font-medium text-slate-50">{release.artist}</span>,
    cellClass: 'min-w-[140px]',
  },
  title: {
    header: (t, sortProps) => <SortButton label={t('collection.titleColumn')} column="title" {...sortProps} />,
    cell: (release) => (
      <Link to={`/release/${release.id}`} className="transition hover:text-brand-200">
        {release.title}
      </Link>
    ),
  },
  year: {
    header: (t, sortProps) => <SortButton label={t('collection.year')} column="year" {...sortProps} />,
    cell: (release) => <span className="text-slate-300">{release.year || '-'}</span>,
  },
  genre: {
    header: (t) => t('collection.genre'),
    cell: (release) => <span className="text-slate-300">{joinNames(release.genres)}</span>,
  },
  format: {
    header: (t) => t('collection.format'),
    cell: (release) => <span className="text-slate-300">{joinNames(release.formats)}</span>,
  },
  label: {
    header: (t) => t('collection.label'),
    cell: (release) => <span className="text-slate-300">{joinNames(release.labels)}</span>,
  },
  rating: {
    header: (t, sortProps) => <SortButton label={t('collection.rating')} column="rating" {...sortProps} />,
    cell: (release, { onUpdate }) => (
      <StarRating compact value={release.rating} onChange={(rating) => onUpdate(release, { rating })} />
    ),
  },
  notes: {
    header: (t) => t('collection.notes'),
    cell: (release, { onUpdate }) => (
      <NotesInput value={release.notes_text || ''} onCommit={(notes) => onUpdate(release, { notes })} />
    ),
    cellClass: 'min-w-[220px]',
  },
  condition: {
    header: (t) => t('collection.condition'),
    cell: (release) => (
      <div className="flex flex-wrap gap-1">
        <ConditionBadge value={release.media_condition} kind="media" />
        {release.sleeve_condition ? <ConditionBadge value={release.sleeve_condition} kind="sleeve" /> : null}
      </div>
    ),
  },
  demand: {
    header: (t, sortProps) => <SortButton label={t('collection.demand')} column="community_want" {...sortProps} />,
    cell: (release, { t }) => release.community_want == null
      ? <span className="text-slate-500">-</span>
      : (
        <span className="whitespace-nowrap text-xs text-slate-300" title={t('release.communityTooltip', { have: release.community_have ?? 0, want: release.community_want })}>
          <span className="text-brand-200">♥ {formatCompactNumber(release.community_want)}</span>
          <span className="mx-1 text-slate-600">/</span>
          {formatCompactNumber(release.community_have)}
        </span>
      ),
  },
  price: {
    header: (t, sortProps) => <SortButton label={t('collection.price')} column="estimated_value" {...sortProps} />,
    cell: (release, { currency, t }) => <MarketplaceValue release={release} currency={currency} t={t} />,
  },
  listingStatus: {
    header: (t) => t('collection.listingStatus'),
    cell: (release) => {
      if (!release.listing_status) return <span className="text-slate-500">-</span>;
      const color = release.listing_status === 'For Sale' ? 'text-emerald-300' : 'text-amber-300';
      return <span className={`text-xs font-medium ${color}`}>{release.listing_status}</span>;
    },
  },
  listingPrice: {
    header: (t, sortProps) => <SortButton label={t('collection.listingPrice')} column="listing_price_eur" {...sortProps} />,
    cell: (release, { currency }) => <span className="text-brand-100">{release.listing_price != null ? formatCurrency(release.listing_price, currency) : '-'}</span>,
  },
};

function CollectionTable({
  releases,
  sortBy,
  sortOrder,
  onSort,
  onUpdate,
  visibleColumns,
  currency = 'EUR',
}: {
  releases: CollectionRelease[];
  sortBy: TableSortColumn;
  sortOrder: SortOrder;
  onSort: (column: TableSortColumn) => void;
  onUpdate: (release: CollectionRelease, patch: UpdateReleasePatch) => void;
  visibleColumns: ColumnId[];
  currency?: Currency;
}) {
  const { t } = useI18n();
  const sortProps = useMemo(() => ({ sortBy, sortOrder, onSort }), [onSort, sortBy, sortOrder]);
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const activeColumns = useMemo(
    () => COLUMNS.filter((column) => visibleColumnSet.has(column.id)),
    [visibleColumnSet]
  );

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/5 bg-white/2 text-xs uppercase tracking-[0.12em] text-slate-400">
            <tr>
              {activeColumns.map((col) => (
                <th key={col.id} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                  {RENDERERS[col.id].header(t, sortProps)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {releases.map((release) => (
              <tr key={`${release.id}-${release.instance_id}`} className="border-t border-white/5 align-middle text-slate-200 transition hover:bg-white/3">
                {activeColumns.map((col) => (
                  <td key={col.id} className={`px-4 py-2.5 ${RENDERERS[col.id].cellClass || ''}`}>
                    {RENDERERS[col.id].cell(release, { t, onUpdate, currency })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(CollectionTable);
