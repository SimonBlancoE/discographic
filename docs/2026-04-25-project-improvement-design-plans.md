# Project Improvement Design Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Discographic's reliability, maintainability, large-collection usability, self-hosting safety, and technical foundation before the next feature wave.

**Architecture:** Keep changes incremental and aligned with the current Express + SQLite + React architecture. Prefer shared contract modules under `shared/`, focused backend services under `server/services/`, route handlers that orchestrate only, and UI changes that consume normalized API shapes through `src/lib/api.js`.

**Tech Stack:** Node.js, Express, better-sqlite3, React 18, Vite, Tailwind CSS, Vitest, shared JavaScript contract modules.

---

## Scope

This document covers the five improvement areas identified from the current project review:

1. Accurate marketplace/value data semantics.
2. Centralized shared data contracts.
3. Large-collection UX and performance.
4. Self-hosting, backups, and sensitive-data handling.
5. Legacy/runtime debt cleanup.

The Wantlist + price/watch alerts feature is intentionally separated into `docs/2026-04-25-wantlist-price-alerts-implementation-plan.md` because it is a product feature with its own schema, routes, sync job, and UI.

## Current evidence

- `npm test` passes: 29 test files, 217 tests.
- Existing shared contract example: `shared/contracts/dashboardStats.js`.
- Existing marketplace status work: `server/services/marketplaceValue.js`, `server/services/enrichmentQueue.js`, `server/services/dbMigrations.js`.
- Existing data-sync patterns: `server/routes/sync.js`.
- Existing preference API: `server/routes/account.js` and `src/lib/api.js` preference helpers.
- Existing audit references: `docs/2026-04-22-pre-pr-code-quality-audit.txt` and linked task reports.

---

# Plan 1: Accurate marketplace/value data semantics

## Product design

Collectors need to trust value totals, top-value lists, exports, and readiness metrics. The app should never treat an API failure as a real zero-value record. Marketplace state should be visible enough for the UI to say whether a value is known, unavailable, failed, or pending.

## Target model

Use `marketplace_status` as the source of truth:

| Status | Meaning | `estimated_value` |
| --- | --- | --- |
| `pending` | Not enriched yet or queued for retry | `NULL` |
| `priced` | Discogs returned a positive numeric value | `> 0` |
| `unavailable` | Discogs succeeded but no value/listing exists | `NULL` |
| `failed` | Discogs request failed after retries | `NULL` |

Add retry metadata only if the current status column is not enough for operations:

- `marketplace_checked_at TEXT DEFAULT NULL`
- `marketplace_error TEXT DEFAULT NULL`
- `marketplace_attempts INTEGER DEFAULT 0`

## Files to modify

- `server/services/marketplaceValue.js` — return explicit status and nullable value.
- `server/services/enrichmentQueue.js` — select `pending` and retryable `failed` rows without relying on `estimated_value IS NULL` alone.
- `server/services/dbMigrations.js` — add idempotent columns if retry metadata is adopted.
- `server/routes/sync.js` — persist status, value, checked timestamp, and error safely.
- `server/routes/collection.js` — use the same service result for on-demand enrichment.
- `server/routes/stats.js` — count only `marketplace_status = 'priced'` as priced coverage.
- `shared/contracts/dashboardStats.js` — expose marketplace coverage if needed.
- `src/pages/Dashboard.jsx` — label unknown/failed marketplace values separately from zero.
- `src/components/CollectionTable.jsx` and `src/lib/columns.js` — display marketplace status in value/listing columns.
- `tests/marketplace-value.test.js`, `tests/enrich-progress.test.js`, `tests/dashboard-stats-contract.test.js` — extend coverage.

## Implementation tasks

### Task 1.1: Lock marketplace status behavior with tests

- [ ] Add tests in `tests/marketplace-value.test.js` for four cases: positive price, empty stats, network failure, and malformed response.
- [ ] Expected behavior:
  - positive price returns `{ estimatedValue: number, marketplaceStatus: 'priced', error: null }`
  - empty stats returns `{ estimatedValue: null, marketplaceStatus: 'unavailable', error: null }`
  - request failure returns `{ estimatedValue: null, marketplaceStatus: 'failed', error: '<message>' }`
  - malformed response returns `{ estimatedValue: null, marketplaceStatus: 'unavailable', error: null }`
- [ ] Run `npm test -- tests/marketplace-value.test.js` and verify the new tests fail before implementation.

### Task 1.2: Update marketplace value service

- [ ] Modify `server/services/marketplaceValue.js` so it never emits `0` for failed or unknown values.
- [ ] Export a single `MARKETPLACE_STATUS` constant and use it everywhere instead of ad hoc strings.
- [ ] Run `npm test -- tests/marketplace-value.test.js` and verify it passes.

### Task 1.3: Update enrichment persistence

- [ ] Modify `server/routes/sync.js` and `server/routes/collection.js` to persist `estimated_value = NULL` when status is `failed`, `unavailable`, or `pending`.
- [ ] If retry metadata is adopted, add an idempotent migration in `server/services/dbMigrations.js`.
- [ ] Add tests in `tests/enrich-progress.test.js` proving failed enrichment remains retryable and does not become a fake priced record.
- [ ] Run `npm test -- tests/enrich-progress.test.js tests/marketplace-value.test.js`.

### Task 1.4: Update stats and UI copy

- [ ] Modify `server/routes/stats.js` so `priced_records` counts `marketplace_status = 'priced'` and `estimated_value > 0`.
- [ ] Add optional dashboard stats fields only if needed: `value_pending_records`, `value_failed_records`, `value_unavailable_records`.
- [ ] Update `shared/contracts/dashboardStats.js` before consuming new fields in React.
- [ ] Update Dashboard coverage copy so collectors understand which records still need value enrichment.
- [ ] Run `npm test -- tests/dashboard-stats-contract.test.js tests/marketplace-value.test.js`.

### Task 1.5: Verify and commit

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `fix: preserve marketplace unknown and failed states`.

---

# Plan 2: Centralized shared data contracts

## Product design

The app should have one documented data shape for every API response that is consumed by multiple UI areas. This reduces bugs when backend routes evolve and makes future features, like Wantlist alerts, safer to add.

## Target contracts

Create or extend contract modules under `shared/contracts/`:

- `dashboardStats.js` — already exists; extend only as needed.
- `release.js` — normalized collection/detail/random/wall release row helpers.
- `account.js` — auth/account/session summary shape.
- `syncStatus.js` — sync, enrichment, thumbnails, inventory, import job states.
- `wantlist.js` — added by the wantlist feature plan.

## Files to modify

- Create: `shared/contracts/release.js`
- Create: `shared/contracts/account.js`
- Create: `shared/contracts/syncStatus.js`
- Modify: `src/lib/api.js`
- Modify: `server/routes/collection.js`
- Modify: `server/routes/auth.js`
- Modify: `server/routes/account.js`
- Modify: `server/routes/sync.js`
- Test: `tests/release-contract.test.js`, `tests/account-contract.test.js`, `tests/sync-status-contract.test.js`

## Implementation tasks

### Task 2.1: Add release contract

- [ ] Write `tests/release-contract.test.js` with stored, hydrated, and client-facing release examples.
- [ ] Create `shared/contracts/release.js` with normalizers for collection rows and detail rows.
- [ ] Update `src/lib/api.js` to normalize `getCollection`, `getRelease`, `getRandomRelease`, and `getCollectionCovers` responses.
- [ ] Run `npm test -- tests/release-contract.test.js`.

### Task 2.2: Add account contract

- [ ] Write `tests/account-contract.test.js` for logged-out, logged-in-without-Discogs, logged-in-with-Discogs, and account-unavailable states.
- [ ] Create `shared/contracts/account.js`.
- [ ] Update `src/lib/AuthContext.jsx` to consume the normalized shape and stop fabricating contradictory account state on failed requests.
- [ ] Run `npm test -- tests/account-contract.test.js`.

### Task 2.3: Add sync/import status contract

- [ ] Write `tests/sync-status-contract.test.js` with idle, running, completed, failed, stalled, enrichment, thumbnails, and inventory examples.
- [ ] Create `shared/contracts/syncStatus.js`.
- [ ] Update `src/lib/api.js`, `src/components/SyncButton.jsx`, and `src/components/ImportButton.jsx` to consume normalized status values.
- [ ] Run `npm test -- tests/sync-status-contract.test.js tests/import-sync-state.test.js`.

### Task 2.4: Verify and commit

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `refactor: centralize shared API contracts`.

---

# Plan 3: Large-collection UX and performance

## Product design

Discographic should remain fast and pleasant for 2,000+ record libraries. The goal is not to add visual complexity; it is to make common collector workflows faster: find, filter, save views, edit, export, and browse.

## Target improvements

1. Virtualized collection table.
2. Saved views for frequently used filters and sorts.
3. Bulk edit/export workflows.
4. Keyboard shortcuts for collection navigation.
5. Bundle splitting for heavy routes.

## Files to modify

- `src/pages/Collection.jsx`
- `src/components/CollectionTable.jsx`
- `src/components/FilterPanel.jsx`
- `src/lib/api.js`
- `src/App.jsx`
- `src/lib/columns.js`
- `server/routes/account.js` for saved view preferences or a dedicated table if views become structured data.
- Tests: `tests/preferences-api.test.js`, `tests/collection-filters.test.js`, new component-level tests if a browser test harness is added later.

## Implementation tasks

### Task 3.1: Add saved collection views

- [ ] Store saved views as JSON in the existing user-scoped `settings` table under key `collection_saved_views`.
- [ ] Shape:

```json
[
  {
    "id": "recent-jazz",
    "name": "Recent Jazz",
    "filters": { "genre": "Jazz", "decade": "1970s", "format": "Vinyl" },
    "sortBy": "date_added",
    "sortOrder": "desc",
    "visibleColumns": ["cover", "artist", "title", "year", "estimated_value"]
  }
]
```

- [ ] Add tests to `tests/preferences-api.test.js` proving saved views persist per user.
- [ ] Add UI controls in `src/pages/Collection.jsx` after the filter/search row.
- [ ] Run `npm test -- tests/preferences-api.test.js tests/collection-filters.test.js`.

### Task 3.2: Improve table rendering for large pages

- [ ] Keep API pagination for now; do not fetch the entire collection.
- [ ] Reduce cell re-render churn by memoizing column definitions and row action callbacks in `Collection.jsx`.
- [ ] If table pages grow beyond 100 rows, add virtualization inside `CollectionTable.jsx`; otherwise defer virtualization and preserve simple DOM table semantics.
- [ ] Manually test a seeded collection at 20, 50, and 100 row limits.

### Task 3.3: Add route-level code splitting

- [ ] Convert page imports in `src/App.jsx` to `React.lazy` for Dashboard, Collection, CollectionWall, ReleaseDetail, Settings, Login, and Setup.
- [ ] Wrap routes in `Suspense` with the existing loading copy.
- [ ] Run `npm run build` and check whether the main JS chunk warning is reduced.
- [ ] Run `npm test`.

### Task 3.4: Verify and commit

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: improve large collection workflows`.

---

# Plan 4: Self-hosting, backups, and sensitive-data handling

## Product design

The app should be safe for non-technical self-hosters. They need to understand where their data lives, how to back it up, how to restore it, and what secrets may be inside the database.

## Target improvements

1. In-app backup download for SQLite data.
2. Clear restore documentation.
3. Health diagnostics endpoint and settings panel.
4. Security copy around Discogs tokens and backups.
5. Safer default deployment docs.

## Files to modify

- Create: `server/routes/backup.js`
- Modify: `server/index.js`
- Modify: `src/pages/Settings.jsx`
- Modify: `src/lib/api.js`
- Modify: `shared/i18n.js`
- Modify: `README.md` and `README.es.md`
- Tests: `tests/backup-route.test.js` if route tests are added; otherwise add service-level tests for backup metadata helpers.

## Implementation tasks

### Task 4.1: Add backup endpoint

- [ ] Create a route that requires admin role.
- [ ] Use SQLite backup-safe behavior: checkpoint WAL before serving or create a temporary consistent backup file under a safe temp directory.
- [ ] Name downloads `discographic-backup-YYYY-MM-DD.sqlite`.
- [ ] Add warning copy: backups may contain Discogs tokens and local collection data.

### Task 4.2: Add health diagnostics

- [ ] Extend `/api/health` or create `/api/admin/health` for authenticated admin diagnostics.
- [ ] Include database connectivity, WAL mode, app version, Discogs account configured/not configured, last sync status, and pending enrichment count.
- [ ] Do not include tokens, passwords, raw cookies, or private hostnames.

### Task 4.3: Add Settings UI

- [ ] Add an admin-only `Backups & diagnostics` card to `src/pages/Settings.jsx`.
- [ ] Add buttons for `Download backup` and `Refresh diagnostics`.
- [ ] Show security warnings in Spanish and English.

### Task 4.4: Update docs

- [ ] Update `README.md` first because it is canonical.
- [ ] Mirror content in `README.es.md` in the same PR.
- [ ] Document Docker volume backup and restore commands.
- [ ] Document that database backups can contain Discogs tokens.

### Task 4.5: Verify and commit

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `feat: add self-hosting backup diagnostics`.

---

# Plan 5: Legacy/runtime debt cleanup

## Product design

The app should keep its normal startup path boring: create current schema, apply current migrations, start the server. Legacy bridges should be isolated, documented, and removable after a defined support window.

## Target improvements

1. Isolate legacy `_v2` table migration code.
2. Decide whether `/api/value` is revived or removed.
3. Replace silent preference failures with visible but non-disruptive notices.
4. Remove confirmed unused code and stale copy.
5. Address Vite/react-babel deprecation warnings.

## Files to modify

- `server/db.js`
- `server/services/dbMigrations.js`
- `server/routes/auth.js`
- `server/routes/account.js`
- `src/pages/Collection.jsx`
- `src/components/ImportButton.jsx`
- `server/routes/import.js`
- `src/lib/achievements.js`
- `shared/i18n.js`
- `vite.config.js`
- Tests listed in the audit docs plus `npm test` and `npm run build`.

## Implementation tasks

### Task 5.1: Define supported migration floor

- [ ] Add a short `docs/database-upgrade-policy.md` explaining the oldest supported version and which startup bridges remain.
- [ ] If supporting all public versions, keep legacy bridges but move them into named migration functions in `server/services/dbMigrations.js`.
- [ ] If not supporting pre-v0.2 databases, remove obsolete branches after adding a clear startup error for unsupported schemas.

### Task 5.2: Isolate startup migration code

- [ ] Move transitional migration helpers out of `server/db.js` into `server/services/dbMigrations.js`.
- [ ] Keep `server/db.js` responsible for opening SQLite, enabling pragmas, invoking migrations, and exporting helpers.
- [ ] Run `npm test -- tests/db-migration.test.js tests/marketplace-status-migration.test.js`.

### Task 5.3: Remove or revive stale value route

- [ ] Search for `/api/value` and `api.getValue()`.
- [ ] If no UI consumer exists, remove the route/client helper and associated stale settings writes.
- [ ] If revived, connect it to current dashboard value semantics and add tests.

### Task 5.4: Replace silent preference failures

- [ ] In `src/pages/Collection.jsx`, replace empty `catch {}` blocks with toast warnings that do not block collection browsing.
- [ ] Add copy keys in `shared/i18n.js` for preference load/save failures.
- [ ] Run `npm test -- tests/preferences-api.test.js tests/i18n-columns.test.js`.

### Task 5.5: Trim stale copy and comments

- [ ] Replace implementation-history dashboard copy with collector-facing copy.
- [ ] Remove decorative fallback genres from `VinylBadge` or use an intentionally neutral loading state.
- [ ] Trim banner comments in `src/components/ImportButton.jsx` and `server/routes/import.js` while preserving comments that explain non-obvious behavior.
- [ ] Run `npm test -- tests/i18n-columns.test.js tests/vinyl-badge.test.js`.

### Task 5.6: Address Vite deprecation warnings

- [ ] Inspect `vite.config.js` and plugin versions.
- [ ] Remove deprecated `esbuild` options if they are app-defined.
- [ ] If warnings come from dependency internals, document the dependency version and upgrade path.
- [ ] Run `npm test` and `npm run build` to verify warning status.

### Task 5.7: Verify and commit

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Commit with `refactor: clean startup and fallback debt`.

---

## Recommended implementation order

1. Plan 1 — marketplace/value semantics. This protects data trust.
2. Plan 2 — shared contracts. This lowers risk for all following work.
3. Wantlist + price/watch alerts feature plan.
4. Plan 4 — backups and diagnostics. This improves self-hosting trust before wider feature use.
5. Plan 3 — large-collection workflow polish.
6. Plan 5 — legacy/runtime debt cleanup can be split across PRs, but the migration isolation should happen before major schema-heavy work if possible.

## Final verification checklist

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] No credentials or tokens are written to docs, tests, or logs.
- [ ] `README.md` changes are mirrored in `README.es.md` when applicable.
- [ ] New API shapes are normalized through `shared/contracts/` before UI consumption.
- [ ] User-facing strings are available in both English and Spanish.
