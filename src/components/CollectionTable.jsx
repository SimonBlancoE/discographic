import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatCurrency, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { COLUMNS } from '../lib/columns';
import StarRating from './StarRating';

function NotesInput({ value, onCommit }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      placeholder={t('collection.notePlaceholder')}
      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-300"
    />
  );
}

function SortButton({ label, column, sortBy, sortOrder, onSort }) {
  const active = sortBy === column;
  return (
    <button type="button" onClick={() => onSort(column)} className={`flex items-center gap-1 ${active ? 'text-brand-200' : 'text-slate-300'}`}>
      <span>{label}</span>
      <span>{active ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

const RENDERERS = {
  cover: {
    header: (t) => t('collection.cover'),
    cell: (release, { t }) => (
      <Link to={`/release/${release.id}`} className="cover-peek-trigger relative block h-16 w-16 overflow-visible rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/70">
        <span className="block h-16 w-16 overflow-hidden rounded-2xl bg-slate-900/80 shadow-[0_12px_30px_rgba(2,6,23,0.35)]">
          {release.cover_url ? (
            <img src={release.cover_url} alt={`${release.title}`} className="h-full w-full object-cover transition duration-300 hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl">💿</div>
          )}
        </span>
        {release.cover_url ? (
          <span className="cover-peek absolute left-20 top-1/2 z-20 hidden w-40 -translate-y-1/2 rounded-[28px] border border-white/10 bg-slate-950/90 p-2 shadow-[0_24px_60px_rgba(2,6,23,0.48)] backdrop-blur-xl lg:block">
             <img src={release.cover_url} alt={t('collection.coverExpanded', { title: release.title })} className="aspect-square w-full rounded-[20px] object-cover" />
          </span>
        ) : null}
      </Link>
    ),
  },
  artist: {
    header: (t, sortProps) => <SortButton label={t('collection.artist')} column="artist" {...sortProps} />,
    cell: (release) => <span className="font-medium text-slate-50">{release.artist}</span>,
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
  price: {
    header: (t, sortProps) => <SortButton label={t('collection.price')} column="estimated_value" {...sortProps} />,
    cell: (release) => <span className="text-brand-100">{release.estimated_value ? formatCurrency(release.estimated_value) : '-'}</span>,
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
    header: (t, sortProps) => <SortButton label={t('collection.listingPrice')} column="listing_price" {...sortProps} />,
    cell: (release) => <span className="text-brand-100">{release.listing_price != null ? formatCurrency(release.listing_price) : '-'}</span>,
  },
};

function CollectionTable({ releases, sortBy, sortOrder, onSort, onUpdate, visibleColumns }) {
  const { t } = useI18n();
  const sortProps = { sortBy, sortOrder, onSort };
  const activeColumns = COLUMNS.filter((c) => visibleColumns.includes(c.id));

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              {activeColumns.map((col) => (
                <th key={col.id} className="px-4 py-3">
                  {RENDERERS[col.id].header(t, sortProps)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {releases.map((release) => (
              <tr key={`${release.id}-${release.instance_id}`} className="border-t border-white/5 align-top text-slate-200 transition hover:bg-white/5">
                {activeColumns.map((col) => (
                  <td key={col.id} className={`px-4 py-3 ${RENDERERS[col.id].cellClass || ''}`}>
                    {RENDERERS[col.id].cell(release, { t, onUpdate })}
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

export default CollectionTable;
