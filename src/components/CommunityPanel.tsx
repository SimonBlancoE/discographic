import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { CommunityRow, DashboardCommunity } from '../../shared/contracts/dashboardStats.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { formatCompactNumber, formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import type { CommunityRefreshStatus } from '../lib/types';
import CoverImage from './CoverImage';
import Icon from './Icon';

type Tab = 'mostWanted' | 'hotRatio' | 'rarest';

const TABS: Array<{ id: Tab; labelKey: string; hintKey: string }> = [
  { id: 'mostWanted', labelKey: 'community.mostWanted', hintKey: 'community.mostWantedHint' },
  { id: 'hotRatio', labelKey: 'community.hotRatio', hintKey: 'community.hotRatioHint' },
  { id: 'rarest', labelKey: 'community.rarest', hintKey: 'community.rarestHint' },
];

const POLL_MS = 2500;
// The shared rate limiter allows ~55 Discogs requests per minute and each release costs one.
const RELEASES_PER_MINUTE = 55;

function CommunityRowItem({ row, rank }: { row: CommunityRow; rank: number }) {
  const { t } = useI18n();

  return (
    <li className="min-w-0">
      <Link to={`/release/${row.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/4">
        <span className="w-5 text-right text-xs tabular-nums text-slate-500">{rank}</span>
        <CoverImage src={`/api/media/cover/${row.id}?variant=poster`} alt="" loading="lazy" className="h-10 w-10 flex-none rounded-lg object-cover" placeholderClassName="h-10 w-10 flex-none rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-100">{row.title}</span>
          <span className="block truncate text-xs text-slate-400">{row.artist}{row.year ? ` · ${row.year}` : ''}</span>
        </span>
        <span className="flex-none text-right text-xs tabular-nums" title={t('release.communityTooltip', { have: row.have, want: row.want })}>
          <span className="block text-brand-200">♥ {formatCompactNumber(row.want)}</span>
          <span className="block text-slate-500">◉ {formatCompactNumber(row.have)}</span>
        </span>
      </Link>
    </li>
  );
}

function CommunityPanel({ community, onUpdated }: { community: DashboardCommunity; onUpdated: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('mostWanted');
  const [status, setStatus] = useState<CommunityRefreshStatus | null>(null);
  const timer = useRef<number | null>(null);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const poll = useCallback(async () => {
    try {
      const next = await api.getCommunityStatus();
      setStatus(next);
      if (next.running) {
        timer.current = window.setTimeout(poll, POLL_MS);
      } else if (next.status === 'completed') {
        onUpdatedRef.current();
      }
    } catch {
      timer.current = window.setTimeout(poll, POLL_MS * 2);
    }
  }, []);

  useEffect(() => {
    // Only ask the server about a running refresh when there is still something to fetch.
    if (community.pending > 0) {
      void poll();
    }

    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  async function start() {
    try {
      await api.startCommunityRefresh();
      setStatus({ status: 'running', running: true, current: 0, total: community.pending, pending: community.pending });
      timer.current = window.setTimeout(poll, POLL_MS);
    } catch (error) {
      toast.error(getErrorMessage(error, t('client.networkError')));
    }
  }

  async function stop() {
    await api.stopCommunityRefresh().catch(() => {});
    void poll();
  }

  const running = Boolean(status?.running);
  const pending = status?.pending ?? community.pending;
  const minutes = Math.max(1, Math.ceil(pending / RELEASES_PER_MINUTE));
  const rows = community[tab];
  const activeTab = TABS.find((item) => item.id === tab)!;
  const progress = status && status.total ? Math.round((status.current / status.total) * 100) : 0;

  return (
    <section className="glass-panel p-5" aria-labelledby="community-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="community-title" className="flex items-center gap-2 font-display text-xl text-white">
            <Icon name="flame" size={18} className="text-brand-300" />
            {t('community.title')}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-slate-400">{t('community.subtitle')}</p>
        </div>
        {community.covered > 0 ? (
          <div className="segmented" role="tablist" aria-label={t('community.title')}>
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {pending > 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-300/20 bg-brand-400/6 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-300">
            {running
              ? t('community.running', { current: formatNumber(status?.current ?? 0), total: formatNumber(status?.total ?? pending) })
              : t('community.pending', { count: formatNumber(pending), minutes })}
            {running ? (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:w-72" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-cyan-300 transition-all" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </div>
          {running ? (
            <button type="button" onClick={stop} className="secondary-button">{t('community.stop')}</button>
          ) : (
            <button type="button" onClick={start} className="primary-button">{t('community.start')}</button>
          )}
        </div>
      ) : null}

      {community.covered > 0 ? (
        <>
          <p className="mt-4 text-xs text-slate-500">{t(activeTab.hintKey)}</p>
          {rows.length ? (
            <ol className="mt-2 grid gap-x-6 md:grid-cols-2">
              {rows.map((row, index) => <CommunityRowItem key={row.id} row={row} rank={index + 1} />)}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{t('community.empty')}</p>
          )}
        </>
      ) : null}
    </section>
  );
}

export default CommunityPanel;
