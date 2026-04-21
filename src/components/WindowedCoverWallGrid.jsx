import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeWallGridMetrics,
  getWallCardPosition,
  WALL_GRID_GAP,
  WALL_TITLE_PANEL_HEIGHT
} from '../lib/wallGrid';

function CoverCard({ release, showTitles, style }) {
  return (
    <Link to={`/release/${release.id}`} className="cover-wall-card group absolute" style={style}>
      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/70 shadow-[0_18px_40px_rgba(2,6,23,0.32)]">
        <div className="aspect-square overflow-hidden bg-slate-900/80">
          {release.wall_cover_url || release.cover_url ? (
            <img
              src={release.wall_cover_url || release.cover_url}
              alt={release.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl">💿</div>
          )}
        </div>
        {showTitles ? (
          <div className="space-y-1 px-3 py-3" style={{ height: `${WALL_TITLE_PANEL_HEIGHT}px` }}>
            <p className="truncate text-sm font-medium text-slate-100">{release.title}</p>
            <p className="truncate text-xs text-slate-400">{release.artist}</p>
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function WindowedCoverWallGrid({ releases, size, showTitles }) {
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const [viewport, setViewport] = useState({
    containerWidth: size,
    viewportTop: 0,
    viewportHeight: 0,
    containerTop: 0
  });

  useEffect(() => {
    function measure() {
      if (!containerRef.current) {
        return;
      }

      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const rect = containerRef.current.getBoundingClientRect();
      const next = {
        containerWidth: Math.round(rect.width),
        viewportTop: Math.round(scrollTop),
        viewportHeight: Math.round(window.innerHeight || 0),
        containerTop: Math.round(rect.top + scrollTop)
      };

      setViewport((current) => (
        current.containerWidth === next.containerWidth
        && current.viewportTop === next.viewportTop
        && current.viewportHeight === next.viewportHeight
        && current.containerTop === next.containerTop
      ) ? current : next);
    }

    function scheduleMeasure() {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    }

    scheduleMeasure();

    const observer = new ResizeObserver(scheduleMeasure);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [releases.length, showTitles, size]);

  const metrics = useMemo(() => computeWallGridMetrics({
    itemCount: releases.length,
    containerWidth: viewport.containerWidth,
    minCardSize: size,
    showTitles,
    viewportTop: viewport.viewportTop,
    viewportHeight: viewport.viewportHeight,
    containerTop: viewport.containerTop
  }), [releases.length, showTitles, size, viewport]);

  const visibleReleases = releases.slice(metrics.startIndex, metrics.endIndex);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ minHeight: releases.length ? `${metrics.totalHeight}px` : undefined }}
    >
      {visibleReleases.map((release, offset) => {
        const index = metrics.startIndex + offset;
        const position = getWallCardPosition(index, metrics, WALL_GRID_GAP);

        return (
          <CoverCard
            key={release.id}
            release={release}
            showTitles={showTitles}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`
            }}
          />
        );
      })}
    </div>
  );
}

export default WindowedCoverWallGrid;
