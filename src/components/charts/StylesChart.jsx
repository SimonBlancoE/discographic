import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function StylesChart({ data, onSelect }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-[480px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
          <XAxis type="number" stroke="#94a3b8" />
          <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} interval={0} tick={{ fontSize: 13 }} />
          <Tooltip {...tooltipProps} formatter={(value) => [value, t('dashboard.records', { count: value })]} />
          <Bar dataKey="count" fill="#34d399" radius={[0, 10, 10, 0]} onClick={(entry) => onSelect?.(entry?.name)} cursor={onSelect ? 'pointer' : 'default'} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StylesChart;
