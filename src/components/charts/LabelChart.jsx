import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function LabelChart({ data, onSelect }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ left: 18 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
          <XAxis type="number" stroke="#94a3b8" />
          <YAxis dataKey="name" type="category" stroke="#94a3b8" width={110} />
          <Tooltip {...tooltipProps} formatter={(value) => [value, t('dashboard.records', { count: value })]} />
          <Bar dataKey="count" fill="#f97316" radius={[0, 10, 10, 0]} onClick={(entry) => onSelect?.(entry?.name)} cursor={onSelect ? 'pointer' : 'default'} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default LabelChart;
