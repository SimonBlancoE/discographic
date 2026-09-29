// Shared chart styling: one accent for every mark, warm neutral ink for axes and text.
export const CHART_COLORS = {
  mark: '#d1a45a',
  markMuted: 'rgba(209, 164, 90, 0.18)',
  axis: '#78716c',
  grid: 'rgba(255, 248, 235, 0.06)',
  text: '#a8a29e',
} as const;

export const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fill: CHART_COLORS.text, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export const tooltipProps = {
  contentStyle: {
    backgroundColor: 'rgba(26, 26, 24, 0.97)',
    border: '1px solid rgba(255, 248, 235, 0.12)',
    borderRadius: '10px',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
    padding: '8px 12px',
  },
  labelStyle: {
    color: '#f1eee7',
    fontWeight: 600,
    marginBottom: 4,
  },
  itemStyle: {
    color: '#d6d3d1',
  },
  cursor: { fill: 'rgba(255, 248, 235, 0.04)' },
};
