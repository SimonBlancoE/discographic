import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatCurrency, joinNames } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
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

function CollectionTable({ releases, sortBy, sortOrder, onSort, onUpdate }) {
  const { t } = useI18n();

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              <th className="px-4 py-3">{t('collection.cover')}</th>
              <th className="px-4 py-3"><SortButton label={t('collection.artist')} column="artist" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
              <th className="px-4 py-3"><SortButton label={t('collection.titleColumn')} column="title" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
              <th className="px-4 py-3"><SortButton label={t('collection.year')} column="year" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
              <th className="px-4 py-3">{t('collection.genre')}</th>
              <th className="px-4 py-3">{t('collection.format')}</th>
              <th className="px-4 py-3">{t('collection.label')}</th>
              <th className="px-4 py-3"><SortButton label={t('collection.rating')} column="rating" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
              <th className="px-4 py-3">{t('collection.notes')}</th>
              <th className="px-4 py-3"><SortButton label={t('collection.price')} column="estimated_value" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} /></th>
            </tr>
          </thead>
          <tbody>
            {releases.map((release) => (
              <tr key={`${release.id}-${release.instance_id}`} className="border-t border-white/5 align-top text-slate-200 transition hover:bg-white/5">
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3 font-medium text-slate-50">{release.artist}</td>
                <td className="px-4 py-3">
                  <Link to={`/release/${release.id}`} className="transition hover:text-brand-200">
                    {release.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300">{release.year || '-'}</td>
                <td className="px-4 py-3 text-slate-300">{joinNames(release.genres)}</td>
                <td className="px-4 py-3 text-slate-300">{joinNames(release.formats)}</td>
                <td className="px-4 py-3 text-slate-300">{joinNames(release.labels)}</td>
                <td className="px-4 py-3">
                  <StarRating compact value={release.rating} onChange={(rating) => onUpdate(release, { rating })} />
                </td>
                <td className="min-w-[220px] px-4 py-3">
                  <NotesInput value={release.notes_text || ''} onCommit={(notes) => onUpdate(release, { notes })} />
                </td>
                <td className="px-4 py-3 text-brand-100">{release.estimated_value ? formatCurrency(release.estimated_value) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CollectionTable;
