import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function CategoryPie({ data, colors, innerRadius, outerRadius = 110, paddingAngle, onSelect }) {
  const { t } = useI18n();

  return (
    <div className="chart-wrap h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={paddingAngle}
            {...(onSelect ? { onClick: (entry) => onSelect(entry?.name), cursor: 'pointer' } : {})}
          >
            {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
          </Pie>
          <Tooltip {...tooltipProps} formatter={(value, name) => [t('chart.records', { count: value }), name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default CategoryPie;
