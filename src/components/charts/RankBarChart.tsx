import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NamedCountRow } from '../../../shared/contracts/dashboardStats.js';
import { useI18n } from '../../lib/I18nContext';
import { axisProps, CHART_COLORS, tooltipProps } from './ChartTooltip';

const ROW_HEIGHT = 28;
const MAX_LABEL = 18;

function shorten(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

/**
 * Ranked counts as thin horizontal bars in a single hue. Used for genres, formats, labels and styles:
 * the name is the identity and the bar length the magnitude, so no categorical colors are needed.
 */
function RankBarChart({ data, limit = 10, onSelect }: { data: NamedCountRow[]; limit?: number; onSelect?: (value: string) => void }) {
  const { t } = useI18n();
  const rows = data.slice(0, limit);

  return (
    <div className="chart-wrap" style={{ height: Math.max(160, rows.length * ROW_HEIGHT + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 12 }} barCategoryGap={8}>
          <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis dataKey="name" type="category" width={128} interval={0} tickFormatter={shorten} {...axisProps} />
          <Tooltip {...tooltipProps} formatter={(value) => [t('chart.records', { count: Number(value) || 0 }), '']} separator="" />
          <Bar
            dataKey="count"
            fill={CHART_COLORS.mark}
            maxBarSize={14}
            radius={[0, 4, 4, 0]}
            onClick={(entry) => onSelect?.(String(entry?.name || ''))}
            cursor={onSelect ? 'pointer' : 'default'}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default RankBarChart;
