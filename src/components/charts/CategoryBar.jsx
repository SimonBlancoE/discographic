import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../lib/I18nContext';
import { tooltipProps } from './ChartTooltip';

function CategoryBar({
  data,
  fill,
  layout = 'horizontal',
  heightClass = 'h-80',
  limit,
  yAxisWidth = 110,
  yAxisCompactTicks = false,
  onSelect
}) {
  const { t } = useI18n();
  const rows = limit ? data.slice(0, limit) : data;
  const isVertical = layout === 'vertical';
  const radius = isVertical ? [0, 10, 10, 0] : [10, 10, 0, 0];
  const marginLeft = isVertical ? (yAxisCompactTicks ? 8 : 18) : undefined;

  return (
    <div className={`chart-wrap ${heightClass}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout={layout} margin={marginLeft != null ? { left: marginLeft } : undefined}>
          {isVertical
            ? <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
            : <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" vertical={false} />}
          {isVertical ? (
            <>
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#94a3b8"
                width={yAxisWidth}
                {...(yAxisCompactTicks ? { interval: 0, tick: { fontSize: 13 } } : {})}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
            </>
          )}
          <Tooltip {...tooltipProps} formatter={(value) => [value, t('dashboard.records', { count: value })]} />
          <Bar
            dataKey="count"
            fill={fill}
            radius={radius}
            {...(onSelect ? { onClick: (entry) => onSelect(entry?.name), cursor: 'pointer' } : {})}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default CategoryBar;
