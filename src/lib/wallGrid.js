export const WALL_GRID_GAP = 16;
export const WALL_TITLE_PANEL_HEIGHT = 64;
export const WALL_OVERSCAN_ROWS = 2;

export function filterWallReleases(releases, filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase();

  return releases.filter((release) => {
    if (query && !`${release.artist} ${release.title}`.toLowerCase().includes(query)) {
      return false;
    }

    if (filters.genre && !(release.genres || []).includes(filters.genre)) {
      return false;
    }

    if (filters.style && !(release.styles || []).includes(filters.style)) {
      return false;
    }

    if (filters.decade) {
      const start = Number(filters.decade);
      if (!Number.isFinite(start) || !(release.year >= start && release.year < start + 10)) {
        return false;
      }
    }

    if (filters.format) {
      const formats = (release.formats || []).map((format) => format?.name || format);
      if (!formats.includes(filters.format)) {
        return false;
      }
    }

    if (filters.label) {
      const labels = (release.labels || []).map((label) => label?.name || label);
      if (!labels.includes(filters.label)) {
        return false;
      }
    }

    return true;
  });
}

export function computeWallGridMetrics({
  itemCount,
  containerWidth,
  minCardSize,
  showTitles,
  viewportTop = 0,
  viewportHeight = 0,
  containerTop = 0,
  gap = WALL_GRID_GAP,
  overscanRows = WALL_OVERSCAN_ROWS
}) {
  if (!itemCount) {
    return {
      columns: 1,
      columnWidth: minCardSize,
      cardHeight: minCardSize + (showTitles ? WALL_TITLE_PANEL_HEIGHT : 0),
      rowStride: minCardSize + (showTitles ? WALL_TITLE_PANEL_HEIGHT : 0) + gap,
      totalRows: 0,
      totalHeight: 0,
      startIndex: 0,
      endIndex: 0
    };
  }

  const safeWidth = Math.max(containerWidth || 0, minCardSize);
  const columns = Math.max(1, Math.floor((safeWidth + gap) / (minCardSize + gap)));
  const columnWidth = (safeWidth - (gap * (columns - 1))) / columns;
  const titleHeight = showTitles ? WALL_TITLE_PANEL_HEIGHT : 0;
  const cardHeight = columnWidth + titleHeight;
  const rowStride = cardHeight + gap;
  const totalRows = Math.ceil(itemCount / columns);
  const totalHeight = Math.max(0, totalRows * cardHeight + Math.max(0, totalRows - 1) * gap);

  const relativeTop = Math.max(0, viewportTop - containerTop);
  const relativeBottom = Math.max(relativeTop, viewportTop + viewportHeight - containerTop);

  const startRow = viewportHeight > 0
    ? Math.min(totalRows - 1, Math.max(0, Math.floor(relativeTop / rowStride) - overscanRows))
    : 0;
  const endRow = viewportHeight > 0
    ? Math.min(totalRows - 1, Math.floor(relativeBottom / rowStride) + overscanRows)
    : Math.min(totalRows - 1, overscanRows * 3);

  return {
    columns,
    columnWidth,
    cardHeight,
    rowStride,
    totalRows,
    totalHeight,
    startIndex: startRow * columns,
    endIndex: Math.min(itemCount, (endRow + 1) * columns)
  };
}

export function getWallCardPosition(index, metrics, gap = WALL_GRID_GAP) {
  const row = Math.floor(index / metrics.columns);
  const column = index % metrics.columns;

  return {
    top: row * metrics.rowStride,
    left: column * (metrics.columnWidth + gap),
    width: metrics.columnWidth
  };
}
