function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNamedCountRows(rows) {
  return asArray(rows)
    .map((row) => ({
      name: asText(row?.name),
      count: asNumber(row?.count)
    }))
    .filter((row) => row.name);
}

function normalizeArtistRows(rows) {
  return asArray(rows)
    .map((row) => ({
      artist: asText(row?.artist),
      count: asNumber(row?.count)
    }))
    .filter((row) => row.artist);
}

function normalizeGrowthRows(rows) {
  return asArray(rows)
    .map((row) => ({
      month: asText(row?.month),
      count: asNumber(row?.count)
    }))
    .filter((row) => row.month);
}

function normalizeTopValueRows(rows) {
  return asArray(rows)
    .map((row) => ({
      id: asNumber(row?.id, null),
      release_id: asNumber(row?.release_id, null),
      artist: asText(row?.artist, '-'),
      title: asText(row?.title, '-'),
      year: asNullableNumber(row?.year),
      cover_url: typeof row?.cover_url === 'string' ? row.cover_url : null,
      estimated_value: asNullableNumber(row?.estimated_value)
    }))
    .filter((row) => row.id != null);
}

function normalizeLastSync(lastSync) {
  if (!lastSync || typeof lastSync !== 'object') {
    return null;
  }

  return {
    started_at: typeof lastSync.started_at === 'string' ? lastSync.started_at : null,
    finished_at: typeof lastSync.finished_at === 'string' ? lastSync.finished_at : null,
    records_synced: asNumber(lastSync.records_synced),
    status: typeof lastSync.status === 'string' ? lastSync.status : null
  };
}

export function normalizeDashboardStats(payload = {}) {
  const totals = payload?.totals || {};

  return {
    totals: {
      total_records: asNumber(totals.total_records),
      total_value: asNullableNumber(totals.total_value),
      rated_records: asNumber(totals.rated_records),
      notes_records: asNumber(totals.notes_records),
      priced_records: asNumber(totals.priced_records)
    },
    genres: normalizeNamedCountRows(payload.genres),
    decades: normalizeNamedCountRows(payload.decades),
    formats: normalizeNamedCountRows(payload.formats),
    labels: normalizeNamedCountRows(payload.labels),
    styles: normalizeNamedCountRows(payload.styles),
    growth: normalizeGrowthRows(payload.growth),
    topValue: normalizeTopValueRows(payload.topValue),
    artists: normalizeArtistRows(payload.artists),
    lastSync: normalizeLastSync(payload.lastSync),
    displayCurrency: typeof payload.displayCurrency === 'string' ? payload.displayCurrency : null
  };
}

export function getDashboardBadgeGenres(stats, limit = 5) {
  return asArray(stats?.genres).slice(0, limit);
}
