type UnknownRecord = Record<string, unknown>;
export type NamedCountRow = {
  name: string;
  count: number;
};
export type ArtistCountRow = {
  artist: string;
  count: number;
};
export type GrowthRow = {
  month: string;
  count: number;
};
export type TopValueRow = {
  id: number;
  release_id: number | null;
  artist: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  estimated_value: number | null;
};
export type DashboardLastSync = {
  started_at: string | null;
  finished_at: string | null;
  records_synced: number;
  status: string | null;
};
export type DashboardStats = {
  totals: {
    total_records: number;
    total_value: number | null;
    rated_records: number;
    notes_records: number;
    priced_records: number;
    value_pending_records: number;
    value_failed_records: number;
    value_unavailable_records: number;
  };
  genres: NamedCountRow[];
  decades: NamedCountRow[];
  formats: NamedCountRow[];
  labels: NamedCountRow[];
  styles: NamedCountRow[];
  growth: GrowthRow[];
  topValue: TopValueRow[];
  artists: ArtistCountRow[];
  lastSync: DashboardLastSync | null;
  displayCurrency: string | null;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number;
function asNumber(value: unknown, fallback: number): number;
function asNumber(value: unknown, fallback: null): number | null;
function asNumber(value: unknown, fallback: number | null = 0): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function normalizeNamedCountRows(rows: unknown): NamedCountRow[] {
  return asArray(rows)
    .map((row) => {
      const source = asRecord(row);
      return {
        name: asText(source?.name),
        count: asNumber(source?.count),
      };
    })
    .filter((row) => row.name);
}

function normalizeArtistRows(rows: unknown): ArtistCountRow[] {
  return asArray(rows)
    .map((row) => {
      const source = asRecord(row);
      return {
        artist: asText(source?.artist),
        count: asNumber(source?.count),
      };
    })
    .filter((row) => row.artist);
}

function normalizeGrowthRows(rows: unknown): GrowthRow[] {
  return asArray(rows)
    .map((row) => {
      const source = asRecord(row);
      return {
        month: asText(source?.month),
        count: asNumber(source?.count),
      };
    })
    .filter((row) => row.month);
}

function normalizeTopValueRows(rows: unknown): TopValueRow[] {
  return asArray(rows)
    .map((row) => {
      const source = asRecord(row);
      return {
        id: asNumber(source?.id, null),
        release_id: asNumber(source?.release_id, null),
        artist: asText(source?.artist, '-'),
        title: asText(source?.title, '-'),
        year: asNullableNumber(source?.year),
        cover_url: typeof source?.cover_url === 'string' ? source.cover_url : null,
        estimated_value: asNullableNumber(source?.estimated_value),
      };
    })
    .filter((row) => row.id != null) as TopValueRow[];
}

function normalizeLastSync(lastSync: unknown): DashboardLastSync | null {
  if (!lastSync || typeof lastSync !== 'object') {
    return null;
  }

  const source = asRecord(lastSync);
  return {
    started_at: typeof source?.started_at === 'string' ? source.started_at : null,
    finished_at: typeof source?.finished_at === 'string' ? source.finished_at : null,
    records_synced: asNumber(source?.records_synced),
    status: typeof source?.status === 'string' ? source.status : null
  };
}

export function normalizeDashboardStats(payload: UnknownRecord = {}): DashboardStats {
  const totals = asRecord(payload?.totals) ?? {};

  return {
    totals: {
      total_records: asNumber(totals.total_records),
      total_value: asNullableNumber(totals.total_value),
      rated_records: asNumber(totals.rated_records),
      notes_records: asNumber(totals.notes_records),
      priced_records: asNumber(totals.priced_records),
      value_pending_records: asNumber(totals.value_pending_records),
      value_failed_records: asNumber(totals.value_failed_records),
      value_unavailable_records: asNumber(totals.value_unavailable_records)
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

export function getDashboardBadgeGenres(
  stats: Record<string, unknown> | null | undefined,
  limit = 5,
): NamedCountRow[] {
  return asArray(stats?.genres).slice(0, limit) as NamedCountRow[];
}
