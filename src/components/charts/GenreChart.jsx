import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

const COLORS = ['#fb7185', '#38bdf8', '#f59e0b', '#34d399', '#a78bfa', '#f97316', '#22c55e', '#e879f9'];

function GenreChart({ data, onSelect }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3} onClick={(entry) => onSelect?.(entry?.name)} cursor={onSelect ? 'pointer' : 'default'}>
            {data.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip {...tooltipProps} formatter={(value, name) => [t('chart.records', { count: value }), name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default GenreChart;
