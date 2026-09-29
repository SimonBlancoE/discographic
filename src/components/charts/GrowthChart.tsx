import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GrowthRow } from '../../../shared/contracts/dashboardStats.js';
import { useI18n } from '../../lib/I18nContext';
import { axisProps, CHART_COLORS } from './ChartTooltip';
import type { Translate } from '../../lib/types';

type GrowthPoint = {
  total: number;
  added: number;
};

function CustomTooltip({ active, payload, label, t }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: string | number;
  t: Translate;
}) {
  if (!active || !payload?.length) return null;

  const chartPayload = payload[0]?.payload as GrowthPoint | undefined;
  if (!chartPayload) {
    return null;
  }

  const { total, added } = chartPayload;

  return (
    <div className="rounded-[10px] border border-white/10 bg-[#1a1a18] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
      <p className="mb-1 font-semibold text-stone-100">{label}</p>
      <p className="m-0 text-stone-300">{t('dashboard.totalRecordsShort')}: <strong className="text-stone-100">{total}</strong> {t('chart.recordsSuffix')}</p>
      {added > 0 && (
        <p className="mt-1 text-stone-400">+{added} {t('dashboard.thisMonth')}</p>
      )}
    </div>
  );
}

function GrowthChart({ data }: { data: GrowthRow[] }) {
  const { t } = useI18n();
  const cumulative = useMemo(() => {
    let total = 0;
    return data.map((point: GrowthRow) => {
      total += point.count;
      return { month: point.month, total, added: point.count };
    });
  }, [data]);

  return (
    <div className="chart-wrap h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cumulative}>
          <defs>
            <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.mark} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART_COLORS.mark} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" minTickGap={24} {...axisProps} />
          <YAxis width={40} {...axisProps} />
          <Tooltip content={({ active, payload, label }) => <CustomTooltip active={active} payload={payload} label={label} t={t} />} cursor={{ stroke: 'rgba(255,248,235,0.15)' }} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={CHART_COLORS.mark}
            strokeWidth={2}
            fill="url(#growthGradient)"
            dot={false}
            activeDot={{ r: 4, fill: CHART_COLORS.mark }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default GrowthChart;
