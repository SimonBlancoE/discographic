import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

const COLORS = ['#14b8a6', '#f97316', '#eab308', '#818cf8', '#f43f5e'];

function FormatChart({ data }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="name" outerRadius={110}>
            {data.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip {...tooltipProps} formatter={(value, name) => [t('chart.records', { count: value }), name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default FormatChart;
