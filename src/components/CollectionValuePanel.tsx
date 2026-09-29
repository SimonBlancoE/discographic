import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardCollectionValue } from '../../shared/contracts/dashboardStats.js';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { formatCurrency } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import Icon from './Icon';

function formatDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));
}

function CollectionValuePanel({ value, onUpdated }: { value: DashboardCollectionValue; onUpdated: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const currency = value.currency || 'EUR';
  const latest = value.history[value.history.length - 1] ?? null;
  const first = value.history[0] ?? null;
  const change = latest?.median != null && first?.median != null && value.history.length > 1 ? latest.median - first.median : null;
  const money = (amount: number | null | undefined) => (amount == null ? '—' : formatCurrency(amount, currency));

  async function refresh() {
    setRefreshing(true);
    try {
      await api.refreshCollectionValue();
      toast.success(t('value.updated'));
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error, t('client.networkError')));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className={`glass-panel grid gap-5 p-5 ${value.history.length > 1 ? 'xl:grid-cols-[1fr_1.3fr]' : ''}`} aria-labelledby="collection-value-title">
      <div className="@container flex min-w-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="collection-value-title" className="flex items-center gap-2 font-display text-xl text-white">
              <Icon name="tag" size={18} className="text-brand-300" />
              {t('value.title')}
            </h3>
            <p className="mt-1 text-sm text-slate-400">{t('value.subtitle')}</p>
          </div>
          <button type="button" onClick={refresh} disabled={refreshing} className="secondary-button flex-none disabled:opacity-60">
            {refreshing ? t('value.refreshing') : t('value.refresh')}
          </button>
        </div>

        {latest ? (
          <>
            {/* Rows on narrow panels, three tiles once the panel itself is wide enough for the amounts. */}
            <dl className="grid gap-2 @[30rem]:grid-cols-3">
              {([['value.minimum', latest.minimum], ['value.median', latest.median], ['value.maximum', latest.maximum]] as const).map(([key, amount]) => (
                <div key={key} className={`flex min-w-0 items-baseline justify-between gap-3 rounded-xl border px-3 py-2.5 @[30rem]:block ${key === 'value.median' ? 'border-brand-300/30 bg-brand-400/5' : 'border-white/5 bg-black/20'}`}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{t(key)}</dt>
                  <dd className="font-display text-lg tabular-nums whitespace-nowrap text-white @[30rem]:mt-1">{money(amount)}</dd>
                </div>
              ))}
            </dl>
            {change != null && first ? (
              <p className="text-sm text-slate-400">
                {t('value.change', { change: `${change >= 0 ? '+' : '−'}${money(Math.abs(change))}`, date: formatDay(first.date, locale) })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-400">{t('value.empty')}</p>
        )}
      </div>

      {value.history.length > 1 ? (
        <div className="chart-wrap h-48 min-w-0">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{t('value.historyHint')}</p>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={value.history}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d1a45a" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#d1a45a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#78716c" tickLine={false} axisLine={false} tickFormatter={(date: string) => formatDay(date, locale)} fontSize={11} />
              <YAxis stroke="#78716c" tickLine={false} axisLine={false} width={70} fontSize={11} tickFormatter={(amount: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount)} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(amount) => money(Number(amount))}
                labelFormatter={(date) => formatDay(String(date), locale)}
                contentStyle={{ background: 'rgba(26,26,24,0.97)', border: '1px solid rgba(255,248,235,0.12)', borderRadius: 10 }}
              />
              <Area type="monotone" dataKey="median" name={t('value.median')} stroke="#d1a45a" strokeWidth={2} fill="url(#valueGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

export default CollectionValuePanel;
