import type { ReactNode } from 'react';
import type {
  AccountCapabilities,
  AccountResponse,
  AccountState,
  NormalizedUser,
} from '../../shared/contracts/account.js';
import type { CollectionSavedView } from '../../shared/contracts/collectionViews.js';
import type { DashboardStats, NamedCountRow } from '../../shared/contracts/dashboardStats.js';
import type {
  RadarResponse,
  RadarWantlistApplyResponse,
  RadarWantlistPreviewResponse,
  RadarWantlistTemplateFormat,
} from '../../shared/contracts/radar.js';
import type {
  CollectionRelease,
  ReleaseDetail,
  WallRelease,
} from '../../shared/contracts/release.js';
import type { ImportFailure, ImportSyncState, SyncStatusState } from '../../shared/contracts/syncStatus.js';
import type { CollectionFilters } from '../../shared/collectionFilters.js';
import type { Currency } from '../../shared/currency.js';
import type { Locale, TranslationVars } from '../../shared/i18n.js';

export type ChildrenProp = {
  children: ReactNode;
};

export type Translate = (key: string, vars?: TranslationVars) => string;

export type I18nContextValue = {
  locale: Locale;
  setLocale: (nextLocale: string) => void;
  t: Translate;
};

export type ToastVariant = 'info' | 'success' | 'error';

export type ToastContextValue = {
  showToast: (input: {
    title?: string;
    description: string;
    variant?: ToastVariant;
    duration?: number;
  }) => void;
  success: (description: string, title?: string) => void;
  error: (description: string, title?: string) => void;
  info: (description: string, title?: string) => void;
};

export type DashboardStatsContextValue = {
  stats: DashboardStats | null;
  badgeGenres: NamedCountRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<DashboardStats | null>;
};

export type RadarData = RadarResponse;
export type { RadarWantlistApplyResponse, RadarWantlistPreviewResponse, RadarWantlistTemplateFormat };

export type AuthMutationResponse = {
  ok: boolean;
  user: NormalizedUser | null;
};

export type AuthContextValue = {
  loading: boolean;
  accountState: AccountState;
  capabilities: AccountCapabilities;
  needsBootstrap: boolean;
  user: NormalizedUser | null;
  loggedIn: boolean;
  isAdmin: boolean;
  discogsConfigured: boolean;
  accountUnavailable: boolean;
  currency: Currency;
  login: (username: string, password: string) => Promise<AuthMutationResponse>;
  bootstrap: (username: string, password: string) => Promise<AuthMutationResponse>;
  logout: () => Promise<void>;
  refreshAccount: () => Promise<AccountState>;
  setCurrencyPreference: (nextCurrency: Currency) => Promise<Currency>;
  refresh: () => Promise<void>;
};

export type ApiError = Error & {
  status?: number;
};

export type MessageResponse = {
  ok: boolean;
  message?: string;
};

export type MeResponse = {
  user: NormalizedUser | null;
};

export type PreferenceResponse = {
  value: string | null;
};

export type AccountUpdateResponse = AccountResponse & {
  cacheReset?: boolean;
  message?: string;
};

export type CollectionFilterOptions = {
  genres: string[];
  styles: string[];
  decades: number[];
  formats: string[];
  labels: string[];
};

export type CollectionPageResponse = {
  releases: CollectionRelease[];
  displayCurrency: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: CollectionFilterOptions;
};

export type WallCollectionResponse = {
  releases: WallRelease[];
  filters: CollectionFilterOptions;
};

export type UserListResponse = {
  users: NormalizedUser[];
};

export type ImportPreviewChange = {
  dbId: number;
  releaseId: number | null;
  instanceId: number | null;
  artist: string;
  title: string;
  currentRating: number;
  newRating: number;
  ratingChanged: boolean;
  currentNotes: string;
  newNotes: string;
  notesChanged: boolean;
  hasChanges: boolean;
};

export type ImportPreviewError = {
  row: number;
  column: string;
  value: string;
  reason: string;
};

export type ImportPreviewRowMiss = {
  row: number;
  identifier: string;
  reason: string;
};

export type ImportPreviewResponse = {
  previewId: string | null;
  totalRows: number;
  matched: number;
  withChanges: number;
  unmatched: number;
  changes: ImportPreviewChange[];
  unmatchedRows: ImportPreviewRowMiss[];
  errors: ImportPreviewError[];
  message?: string;
};

export type ImportApplyResponse = {
  ok: boolean;
  applied: number;
  syncState: ImportSyncState | null;
};

export type UpdateReleasePatch = {
  rating?: number;
  notes?: string;
};

export type SavedCollectionViewDraft = Omit<CollectionSavedView, 'id'> & {
  id: string;
};

export type FilterKey = keyof CollectionFilters;

export type AchievementTier = {
  currentTier: string;
  unlockedTierCount: number;
  totalTiers: number;
  nextGoal: number | null;
  nextLabel: string | null;
  completed: boolean;
};

export type TieredAchievement = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  progress: number;
  tier: AchievementTier;
  hidden: false;
  unlocked: boolean;
  badgeText: string;
};

export type HiddenAchievement = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  hidden: true;
  badgeText: string;
};

export type AchievementSet = {
  tiered: TieredAchievement[];
  hidden: HiddenAchievement[];
};

export type VinylBadgeGenre = {
  name: string;
  bg: string;
};

export type SyncCompleteHandler = () => void | Promise<void>;

export type ReleaseTrackRow = {
  position?: string | number | null;
  title?: string | number | null;
  duration?: string | number | null;
};

export type ImportServiceTranslator = (key: string, vars?: TranslationVars) => string;

export type ImportFailureSummary = ImportFailure[];
export type SyncStatus = SyncStatusState;
export type ReleaseDetails = ReleaseDetail;
