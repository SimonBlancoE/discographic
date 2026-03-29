import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function DecadeChart({ data }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
          <XAxis dataKey="name" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip {...tooltipProps} formatter={(value) => [value, t('dashboard.records', { count: value })]} />
          <Bar dataKey="count" fill="#38bdf8" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default DecadeChart;
