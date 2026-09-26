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
    <section className="glass-panel grid gap-5 p-5 lg:grid-cols-[1fr_1.3fr]" aria-labelledby="collection-value-title">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="collection-value-title" className="flex items-center gap-2 font-display text-xl text-white">
              <Icon name="tag" size={18} className="text-amber-300" />
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
            <div className="grid grid-cols-3 gap-2">
              {([['value.minimum', latest.minimum], ['value.median', latest.median], ['value.maximum', latest.maximum]] as const).map(([key, amount]) => (
                <div key={key} className={`rounded-2xl border px-3 py-3 ${key === 'value.median' ? 'border-amber-300/30 bg-amber-300/[0.06]' : 'border-white/5 bg-black/20'}`}>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t(key)}</p>
                  <p className="mt-1 font-display text-lg text-white sm:text-xl">{money(amount)}</p>
                </div>
              ))}
            </div>
            {change != null && first ? (
              <p className={`text-sm ${change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
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
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#64748b" tickFormatter={(date: string) => formatDay(date, locale)} fontSize={11} />
              <YAxis stroke="#64748b" width={70} fontSize={11} tickFormatter={(amount: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount)} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(amount) => money(Number(amount))}
                labelFormatter={(date) => formatDay(String(date), locale)}
                contentStyle={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="median" name={t('value.median')} stroke="#fbbf24" strokeWidth={2.5} fill="url(#valueGradient)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

export default CollectionValuePanel;
