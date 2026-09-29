import { Link } from 'react-router';
import { conditionShortLabel } from '../../shared/contracts/collectionFields.js';
import type { FolderCountRow, NamedCountRow } from '../../shared/contracts/dashboardStats.js';
import { UNGRADED_CONDITION } from '../../shared/collectionFilters.js';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import Icon from './Icon';

// Same green → red ramp as ConditionBadge, as solid fills for the stacked bar.
const GRADE_FILLS: Record<string, string> = {
  M: '#34d399',
  NM: '#6ee7b7',
  'VG+': '#a3e635',
  VG: '#fbbf24',
  'G+': '#fb923c',
  G: '#f97316',
  F: '#fb7185',
  P: '#e11d48',
};
const UNGRADED_FILL = '#334155';

function ConditionBreakdown({ conditions, folders }: { conditions: NamedCountRow[]; folders: FolderCountRow[] }) {
  const { t } = useI18n();
  const total = conditions.reduce((sum, row) => sum + row.count, 0);
  const graded = conditions.filter((row) => row.name !== UNGRADED_CONDITION);
  const ungraded = conditions.find((row) => row.name === UNGRADED_CONDITION)?.count ?? 0;

  if (!total) {
    return null;
  }

  const segments = [...graded, ...(ungraded ? [{ name: UNGRADED_CONDITION, count: ungraded }] : [])];

  return (
    <section className="glass-panel grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]" aria-labelledby="condition-title">
      <div>
        <h3 id="condition-title" className="flex items-center gap-2 font-display text-xl text-white">
          <Icon name="disc" size={18} className="text-emerald-300" />
          {t('condition.title')}
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {t('condition.subtitle', { graded: formatNumber(total - ungraded), total: formatNumber(total) })}
        </p>

        <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-white/5" role="img" aria-label={t('condition.title')}>
          {segments.map((row) => {
            const short = row.name === UNGRADED_CONDITION ? '' : conditionShortLabel(row.name);
            return (
              <div
                key={row.name}
                title={`${row.name === UNGRADED_CONDITION ? t('condition.ungraded') : row.name}: ${row.count}`}
                style={{ width: `${(row.count / total) * 100}%`, background: GRADE_FILLS[short] ?? UNGRADED_FILL }}
              />
            );
          })}
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {segments.map((row) => {
            const short = row.name === UNGRADED_CONDITION ? '' : conditionShortLabel(row.name);
            return (
              <li key={row.name}>
                <Link
                  to={`/collection?${new URLSearchParams({ condition: row.name }).toString()}`}
                  className="pill-tag transition hover:border-white/25 hover:bg-white/10"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: GRADE_FILLS[short] ?? UNGRADED_FILL }} />
                  {row.name === UNGRADED_CONDITION ? t('condition.ungraded') : short}
                  <span className="text-slate-500">{formatNumber(row.count)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {folders.length ? (
        <div>
          <h3 className="flex items-center gap-2 font-display text-xl text-white">
            <Icon name="folder" size={18} className="text-brand-300" />
            {t('folders.title')}
          </h3>
          <p className="mt-1 text-sm text-slate-400">{t('folders.subtitle')}</p>
          <ul className="mt-4 space-y-1.5">
            {folders.map((folder) => (
              <li key={folder.id}>
                <Link
                  to={`/collection?${new URLSearchParams({ folder: String(folder.id) }).toString()}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/3 px-3 py-2 text-sm transition hover:border-brand-300/30 hover:bg-white/6"
                >
                  <span className="flex min-w-0 items-center gap-2 text-slate-200">
                    <Icon name="folder" size={14} className="flex-none text-slate-500" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                  <span className="text-xs tabular-nums text-slate-400">{formatNumber(folder.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default ConditionBreakdown;
