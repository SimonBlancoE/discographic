import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function CustomTooltip({ active, payload, label, t }) {
  if (!active || !payload?.length) return null;

  const { total, added } = payload[0].payload;

  return (
    <div style={{
      backgroundColor: 'rgba(2, 6, 23, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      boxShadow: '0 16px 40px rgba(2, 6, 23, 0.5)',
      padding: '10px 14px',
    }}>
      <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 6 }}>{label}</p>
      <p style={{ color: '#cbd5e1', margin: 0 }}>{t('dashboard.totalRecordsShort')}: <strong style={{ color: '#f1f5f9' }}>{total}</strong> {t('chart.recordsSuffix')}</p>
      {added > 0 && (
        <p style={{ color: '#34d399', margin: '4px 0 0', fontWeight: 600 }}>+{added} {t('dashboard.thisMonth')}</p>
      )}
    </div>
  );
}

function GrowthChart({ data }) {
  const { t } = useI18n();
  const cumulative = useMemo(() => {
    let total = 0;
    return data.map((point) => {
      total += point.count;
      return { month: point.month, total, added: point.count };
    });
  }, [data]);

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cumulative}>
          <defs>
            <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
          <XAxis dataKey="month" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip content={<CustomTooltip t={t} />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#fb7185"
            strokeWidth={3}
            fill="url(#growthGradient)"
            dot={false}
            activeDot={{ r: 5, fill: '#fb7185' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default GrowthChart;
