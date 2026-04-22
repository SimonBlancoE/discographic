# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Version en espanol: [CHANGELOG.md](CHANGELOG.md)

## [0.2.1] - 2026-04-22

Patch with fixes to the dashboard feature carousel and the header logo badge.

### Fixed

- **Carousel buttons did not respond** — the drag pointer handler was capturing the whole container and intercepting clicks on arrows and dots. Pointer is now scoped to the viewport only.
- **Autoplay cycled too fast** — raised from 9s to 14s; manual-interaction resume delay raised from 3s to 5s.
- **Spanish translations** — rewritten in neutral Castilian Spanish. Dropped DJ jargon ("maleta", "pick", "cavando", "Spin the Crate", "tapete"). English copy trimmed to match: plainer, more direct phrasing.
- **Hover caused elements to move** — removed the mouse-parallax on hero chips and orbs. Hover interaction is now a subtle cyan border glow on the carousel viewport, with no element movement.

### Changed

- **"Next up" indicator removed** — the ticker is gone entirely.
- **Header logo badge enlarged** — from 3.2rem to 5.25rem (record disc from 2.35rem to 4.2rem). Hover still accelerates the spin animation, but no longer surfaces the genre caption.

[0.2.1]: https://github.com/SimonBlancoE/discographic/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-04-22

Release focused on dashboard and wall performance, sync robustness, import and
media localization, plus a broad refactor that lifts shared logic into reusable
modules.

### Added

- **Dashboard Hero Carousel** — animated feature carousel with autoplay, pointer
  and keyboard navigation, and `prefers-reduced-motion` support.
- **VinylBadge** — spinning badge surfacing the collection's top genres,
  animation paused under `prefers-reduced-motion`.
- **DashboardStatsContext** — shared provider that centralizes dashboard stats
  loading and removes duplicate fetches across consumers.
- **Stats contract** — `shared/contracts/dashboardStats.js` normalizes backend
  payloads into a stable shape for the frontend.
- **Cover wall virtualization** — `WindowedCoverWallGrid` renders only visible
  rows; large collections scroll without jank.
- **Post-sync reconciliation** — full syncs prune release rows that no longer
  exist in the user's collection and clean up cached covers for them.
- **Import and media fallback localization** — import messages and cover
  fallback strings now honor the user's locale.
- **Shared notes service** — `server/services/notes.js` unifies note
  normalization, serialization, and cleanup across sync, import, and export.
- **Cover media service** — `server/services/coverMedia.js` centralizes cover
  caching, variants (wall/poster), and cleanup.
- **Shared release filters** — `server/services/releaseFilters.js` and
  `shared/collectionFilters.js` consolidate filters used by stats, collection,
  and export.
- **Import sync** — `server/services/importSync.js` + `src/lib/importSync.js`
  push imported notes and ratings back to Discogs with progress state.
- **Typed contracts under `shared/contracts/`** — first step toward an explicit
  frontend/backend contract surface.
- **Tests** — new coverage for collection filters, reconciliation, cover media,
  export parity, import progress, notes normalization, wall metrics, stats
  contract, badge genres, marketplace_status migration, and marketplace value
  fetch. Total: 217 tests.

### Fixed

- **`marketplace_status` migration re-running every boot** — backfill now runs
  only when the column is first added, preserving existing statuses on re-runs.
- **Silent marketplace fetch errors** — `fetchMarketplaceValue` now logs
  `releaseId` and `error.message` before returning `FAILED`.
- **Unnecessary re-renders in dashboard consumers** — `refresh` wrapped in
  `useCallback`, `badgeGenres` memoized, and `getDashboardBadgeGenres` reduced
  to a pure slice with no re-normalization.
- **Export/import parity** — notes and derived fields round-trip without losing
  metadata.
- **Import notes sync** — imported notes now sync back to Discogs correctly.

### Changed

- **Shared helper refactor** — collection, cover, and filter helpers no longer
  duplicated across routes and services.
- **Dashboard.jsx** — consumes the shared context instead of managing its own
  stats fetch.
- **Enrichment condition** — centralized in `server/services/enrichmentQueue.js`
  with `MARKETPLACE_STATUS` constants for explicit state.

### Removed

- **Unused components** — `CompletionRing`, `StatSparkline`, `CountryChart`,
  `useAnimatedNumber` hook, and the unused `/api/value` route.

[0.2.0]: https://github.com/SimonBlancoE/discographic/compare/v0.1.0...v0.2.0

## [0.1.0] - 2026-04-10

First tagged release. Discographic is a self-hosted Discogs collection manager
for vinyl collectors, featuring sync, enrichment, export/import, and a
dashboard with charts and achievements.

### Added

- **Dynamic currency conversion** — prices stored in EUR, converted in real-time
  via ECB exchange rates with 6-hour caching, yesterday-date fallback, and
  concurrent-fetch deduplication. Currency selector in collection header
  (EUR/USD/GBP) with persistent user preference.
- **Togglable columns** — column registry as single source of truth, ColumnToggle
  popover (rendered via portal), per-user column visibility preferences saved
  to the database.
- **Marketplace listings** — inventory sync fetches user's own Discogs listings,
  picks best per release (prefers "For Sale" over "Draft", lowest price), stores
  original price + EUR conversion. Two new columns: listing status and listing price.
- **Localized exports** — CSV/XLSX column headers use i18n keys in both Spanish
  and English. Cross-locale import tolerance so files exported in one locale can
  be imported in the other.
- **Ephemeral test instance** — `docker-compose.test.yml` with tmpfs storage,
  `scripts/test-instance.sh` for automated bootstrap and user seeding,
  npm scripts `test:instance:start` / `test:instance:stop`.
- **Password management** — admin can reset user passwords, users can change
  their own password.
- **Achievement system** — collection milestones and secret unlocks with
  confetti animations.
- **Test suite** — 77 tests across 9 files covering currency conversion,
  inventory sync, DB migrations, export serialization, i18n columns,
  preferences storage, and enrichment progress.

### Fixed

- **Infinite enrichment loop** — removed `country` from enrichment pending
  condition; releases where Discogs has no country data no longer re-trigger
  enrichment indefinitely.
- **Silent inventory sync failures** — errors now reported via sync state
  instead of only logged to console.
- **Collection column menu overlay** — ColumnToggle popover rendered via
  React portal, eliminating fragile z-index layering.
- **Dockerfile missing shared/ directory** — added COPY for shared/ in
  the runtime stage.

### Changed

- **Preferences API** — restricted to a whitelist of known keys
  (`collection_visible_columns`, `currency`) instead of permissive regex.
- **Column preference save** — debounced with 500ms delay to coalesce
  rapid toggles into a single API call.
- **Sort reset notification** — toast message when sort resets to artist
  after hiding the currently sorted column.
- **Vite dev proxy** — target port configurable via `VITE_API_PORT` env
  variable, defaults to 3800.
- **Currency defaults** — replaced hardcoded `'EUR'` strings in AuthContext
  and Collection with shared `DEFAULT_CURRENCY` constant.

[0.1.0]: https://github.com/SimonBlancoE/discographic/releases/tag/v0.1.0
