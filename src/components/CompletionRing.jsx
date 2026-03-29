function CompletionRing({ segments = [], total = 0 }) {
  const radii = [42, 32, 22];

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        {segments.map((segment, index) => {
          const radius = radii[index] || 16;
          const circumference = 2 * Math.PI * radius;
          const ratio = total > 0 ? segment.value / total : 0;
          const length = Math.max(0, ratio * circumference);

          return (
            <g key={segment.label}>
              <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={segment.stroke}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${length} ${circumference}`}
                className="transition-all duration-700"
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Cobertura</span>
        <span className="mt-1 font-display text-2xl text-white">
          {total > 0 ? Math.round(segments.reduce((sum, segment) => sum + segment.value, 0) / (segments.length * total) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

export default CompletionRing;
