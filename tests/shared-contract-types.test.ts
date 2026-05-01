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
    expect(syncStatus.locale).toBe('es');
    expect(importSyncState.status).toBe('idle');
    expect(locale).toBe('en');

    expectTypeOf(filters).toMatchTypeOf<CollectionFilters>();
    expectTypeOf(accountState).toMatchTypeOf<AccountState>();
    expectTypeOf(dashboardStats).toMatchTypeOf<DashboardStats>();
    expectTypeOf(release).toMatchTypeOf<CollectionRelease>();
    expectTypeOf(collection).toMatchTypeOf<CollectionResponse>();
    expectTypeOf(syncStatus).toMatchTypeOf<SyncStatusState>();
    expectTypeOf(importSyncState).toMatchTypeOf<ImportSyncState>();
    expectTypeOf({ en: {}, es: {} }).toMatchTypeOf<MessagesByLocale>();
  });
});
