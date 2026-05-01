function SkeletonBlock({ className = '' }) {
  return <div className={`skeleton-shimmer rounded-3xl ${className}`.trim()} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="hero-panel space-y-5">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-12 w-full max-w-2xl" />
          <SkeletonBlock className="h-5 w-full max-w-xl" />
          <div className="flex flex-wrap gap-3">
            <SkeletonBlock className="h-10 w-44 rounded-full" />
            <SkeletonBlock className="h-10 w-56 rounded-full" />
          </div>
        </div>
        <div className="glass-panel space-y-4 p-5">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-3 w-full rounded-full" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="glass-panel space-y-4 p-5">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-10 w-32" />
            <SkeletonBlock className="h-16 w-full rounded-[24px]" />
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="glass-panel space-y-4 p-5">
            <SkeletonBlock className="h-6 w-40" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-64 w-full rounded-[28px]" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function CollectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="glass-panel space-y-4 p-5">
        <SkeletonBlock className="h-5 w-28" />
        <SkeletonBlock className="h-10 w-72" />
        <SkeletonBlock className="h-4 w-64" />
      </div>

      <div className="glass-panel grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-12 w-full rounded-2xl" />
          </div>
        ))}
      </div>

      <div className="glass-panel overflow-hidden p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="grid grid-cols-[72px_1.2fr_1.4fr_90px_1fr_1fr_1fr_150px_220px_100px] gap-3 rounded-2xl border border-white/5 px-3 py-3">
              {Array.from({ length: 10 }).map((_, col) => (
                <SkeletonBlock key={col} className={`${col === 0 ? 'h-16 w-16 rounded-2xl' : 'h-5 w-full self-center'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReleaseDetailSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-5 w-40" />
      <section className="glass-panel grid gap-6 p-6 xl:grid-cols-[320px_1fr]">
        <SkeletonBlock className="min-h-[320px] w-full rounded-[28px]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full max-w-xl" />
          <SkeletonBlock className="h-6 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-24 w-full" />
          </div>
          <SkeletonBlock className="h-32 w-full rounded-[28px]" />
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </section>
      <section className="glass-panel space-y-4 p-5">
        <SkeletonBlock className="h-8 w-44" />
        <SkeletonBlock className="h-64 w-full rounded-[28px]" />
      </section>
    </div>
  );
}
