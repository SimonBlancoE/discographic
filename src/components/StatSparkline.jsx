import { useId } from 'react';

function buildPolyline(values, width, height) {
  if (!values.length) {
    return '';
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (((value - min) / range) * (height - 8) + 4);
    return `${x},${y}`;
  }).join(' ');
}

function buildArea(points, width, height) {
  if (!points) {
    return '';
  }

  return `0,${height} ${points} ${width},${height}`;
}

function normalize(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function StatSparkline({ values = [], className = '' }) {
  const gradientId = useId().replace(/:/g, '');
  const normalized = normalize(values);
  const width = 144;
  const height = 56;
  const points = buildPolyline(normalized, width, height);
  const areaPoints = buildArea(points, width, height);

  if (!normalized.length) {
    return null;
  }

  return (
    <div className={`sparkline-wrap ${className}`.trim()} aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible">
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(103, 232, 249, 0.28)" />
            <stop offset="100%" stopColor="rgba(251, 113, 133, 0)" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${gradientId}-area)`} />
        <polyline points={points} fill="none" stroke={`url(#${gradientId}-line)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default StatSparkline;
