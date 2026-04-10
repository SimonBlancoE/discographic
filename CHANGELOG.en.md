# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Version en espanol: [CHANGELOG.md](CHANGELOG.md)

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
