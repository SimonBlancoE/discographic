import { describe, expect, it, expectTypeOf } from 'vitest';
import { createCollectionFilters, type CollectionFilters } from '../shared/collectionFilters.js';
import { DEFAULT_CURRENCY, normalizeCurrency, type Currency } from '../shared/currency.js';
import {
  normalizeAccountState,
  type AccountState,
} from '../shared/contracts/account.js';
import {
  normalizeCollectionSavedView,
  type CollectionSavedView,
} from '../shared/contracts/collectionViews.js';
import {
  normalizeDashboardStats,
  type DashboardStats,
} from '../shared/contracts/dashboardStats.js';
import {
  MARKETPLACE_STATUS,
  hasPricedMarketplaceValue,
  type MarketplaceStatus,
} from '../shared/contracts/marketplace.js';
import {
  normalizeCollectionRelease,
  normalizeCollectionResponse,
  type CollectionRelease,
  type CollectionResponse,
} from '../shared/contracts/release.js';
import {
  normalizeRadarEnrichmentStatus,
  normalizeRadarResponse,
  normalizeRadarUpdateRunStatus,
  normalizeRadarWantlistApplyResponse,
  type RadarEnrichmentStatus,
  type RadarResponse,
  type RadarUpdateRunStatus,
  type RadarWantlistApplyResponse,
  type RadarWantlistPreviewResponse,
  type RadarWantlistTemplateFormat,
} from '../shared/contracts/radar.js';
import {
  normalizeImportSyncState,
  normalizeSyncStatus,
  type ImportSyncState,
  type SyncStatusState,
} from '../shared/contracts/syncStatus.js';
import { resolveLocale, type Locale, type MessagesByLocale } from '../shared/i18n.js';

describe('shared contract types', () => {
  it('exports stable TypeScript boundary types next to the shared normalizers', () => {
    const filters: CollectionFilters = createCollectionFilters({ search: 'Theo' });
    const currency: Currency = normalizeCurrency('usd');
    const accountState: AccountState = normalizeAccountState();
    const savedView: CollectionSavedView | null = normalizeCollectionSavedView({
      id: 'techno',
      name: 'Techno',
    });
    const dashboardStats: DashboardStats = normalizeDashboardStats({});
    const marketplaceStatus: MarketplaceStatus = MARKETPLACE_STATUS.PENDING;
    const release: CollectionRelease = normalizeCollectionRelease({ id: '7' });
    const collection: CollectionResponse = normalizeCollectionResponse({});
    const radar: RadarResponse = normalizeRadarResponse({});
    const radarWantlistTemplateFormat: RadarWantlistTemplateFormat = 'csv';
    const radarWantlistPreview: RadarWantlistPreviewResponse = {
      previewId: 'preview-1',
      summary: {
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
      ],
      ignoredColumns: [],
      rows: [
        {
          row: 2,
          release_id: 7,
          artist: null,
          title: null,
          year: null,
          notes: null,
          date_added: null,
          target_price: null,
          minimum_condition: null,
          priority: null,
        },
      ],
      errors: [],
    };
    const radarWantlistApply: RadarWantlistApplyResponse = normalizeRadarWantlistApplyResponse({
      ok: true,
      radar: {},
      result: {
        totalRows: 1,
        imported: 1,
        skipped: 0,
        added: 1,
        updated: 0,
      },
    });
    const radarEnrichment: RadarEnrichmentStatus = normalizeRadarEnrichmentStatus({});
    const radarUpdateRun: RadarUpdateRunStatus = normalizeRadarUpdateRunStatus({});
    const syncStatus: SyncStatusState = normalizeSyncStatus({});
    const importSyncState: ImportSyncState = normalizeImportSyncState({});
    const locale: Locale = resolveLocale('en');

    expect(filters.search).toBe('Theo');
    expect(currency).toBe('USD');
    expect(accountState.preferences.currency).toBe(DEFAULT_CURRENCY);
    expect(savedView?.id).toBe('techno');
    expect(dashboardStats.genres).toEqual([]);
    expect(marketplaceStatus).toBe('pending');
    expect(hasPricedMarketplaceValue({ marketplace_status: MARKETPLACE_STATUS.PRICED, estimated_value: 1 })).toBe(true);
    expect(release.id).toBe(7);
    expect(collection.releases).toEqual([]);
    expect(radar.items).toEqual([]);
    expect(radarWantlistTemplateFormat).toBe('csv');
    expect(radarWantlistPreview.previewId).toBe('preview-1');
    expect(radarWantlistPreview.summary.validRows).toBe(1);
    expect(radarWantlistApply.result.imported).toBe(1);
    expect(radarEnrichment.status).toBe('idle');
    expect(radarUpdateRun.phase).toBe('idle');
    expect(syncStatus.locale).toBe('es');
    expect(importSyncState.status).toBe('idle');
    expect(locale).toBe('en');

    expectTypeOf(filters).toMatchTypeOf<CollectionFilters>();
    expectTypeOf(accountState).toMatchTypeOf<AccountState>();
    expectTypeOf(dashboardStats).toMatchTypeOf<DashboardStats>();
    expectTypeOf(release).toMatchTypeOf<CollectionRelease>();
    expectTypeOf(collection).toMatchTypeOf<CollectionResponse>();
    expectTypeOf(radar).toMatchTypeOf<RadarResponse>();
    expectTypeOf(radarWantlistPreview).toMatchTypeOf<RadarWantlistPreviewResponse>();
    expectTypeOf(radarWantlistApply).toMatchTypeOf<RadarWantlistApplyResponse>();
    expectTypeOf(radarEnrichment).toMatchTypeOf<RadarEnrichmentStatus>();
    expectTypeOf(radarUpdateRun).toMatchTypeOf<RadarUpdateRunStatus>();
    expectTypeOf(syncStatus).toMatchTypeOf<SyncStatusState>();
    expectTypeOf(importSyncState).toMatchTypeOf<ImportSyncState>();
    expectTypeOf({ en: {}, es: {} }).toMatchTypeOf<MessagesByLocale>();
  });
});
