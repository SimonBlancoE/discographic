import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NamedCountRow } from '../../../shared/contracts/dashboardStats.js';
import { useI18n } from '../../lib/I18nContext';
import { axisProps, CHART_COLORS, tooltipProps } from './ChartTooltip';

function DecadeChart({ data }: { data: NamedCountRow[] }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis allowDecimals={false} width={36} {...axisProps} />
          <Tooltip {...tooltipProps} formatter={(value) => [t('chart.records', { count: Number(value) || 0 }), '']} separator="" />
          <Bar dataKey="count" fill={CHART_COLORS.mark} maxBarSize={28} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default DecadeChart;
