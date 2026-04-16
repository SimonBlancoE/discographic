# Dedup / DRY Findings

## Summary

The codebase is small (~8k LOC) but has several repeating shapes that have grown by copy-paste rather than abstraction. The biggest concentrations are: (a) the collection-filter SQL WHERE builder reimplemented in three server routes, (b) cover-URL trio expansion repeated four times in `collection.js`, (c) a near-identical recharts boilerplate across seven chart components, and (d) a try/catch -> 500 envelope copied across every route handler. There is also a Discogs-notes-field-id resolution snippet duplicated in three places, and two functionally identical "in-memory per-user job state" maps with their own `getX/setX` accessors. Most are clear wins with low risk because the duplicated blocks are non-trivial (10-30 lines) and live very close in style.

## Findings (ranked by impact)

### HIGH Collection-filter WHERE builder reimplemented in three server routes
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:46-88`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/export.js:12-44`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:159-173`
- **Pattern**: Each route walks the same `search/genre/style/decade/format/label` query params and produces the same `WHERE`/params SQL. `media.js` even does it inline (and silently omits `style` parity with the others would catch).
- **Recommendation**: Extract to `server/lib/collectionFilters.js` exporting `buildCollectionWhere(query, userId)` returning `{ clause, params }`; have all three routes import it. Mirror the filter shape in a single `COLLECTION_FILTER_KEYS` constant for the params allowlist.
- **Risk**: Low — the three implementations already agree on semantics for shared keys; extracting forces them to stay in sync (a feature, not a bug).

### HIGH Cover URL trio (`detail/wall/poster_cover_url`) expanded inline 4x
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:229-231,251-253,273-275,350-352`
- **Pattern**: Every endpoint that returns a release (or release-shaped object) hand-writes the same three template-literal URLs against `release.id`/`hydrated.id`/`updated.id`. Adding a fifth variant would require touching all four sites.
- **Recommendation**: Add `withCoverUrls(release)` to `server/db.js` (next to `hydrateRelease`) that returns the input spread with the three derived URLs. Have all GET-shape paths pass through it; `hydrateRelease` itself could compose it.
- **Risk**: None worth noting. Pure data transformation.

### HIGH Recharts boilerplate near-identical across 7 chart components
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/charts/CountryChart.jsx`, `LabelChart.jsx`, `StylesChart.jsx`, `DecadeChart.jsx` (vertical/horizontal BarChart variants); `GenreChart.jsx`, `FormatChart.jsx` (PieChart variants); `GrowthChart.jsx` (also re-inlines the `tooltipProps` styles instead of importing them — see lines 12-18)
- **Pattern**: Each Bar component is the same `ResponsiveContainer > BarChart > CartesianGrid + XAxis + YAxis + Tooltip + Bar` skeleton differing only in `fill`, `width`, `layout`, and `onClick`. Each Pie likewise. `CountryChart` even forgot to spread `tooltipProps` while its siblings include it — confirming the drift cost.
- **Recommendation**: Two thin wrappers in `src/components/charts/`: `<CategoryBar data fill width layout onSelect height />` and `<CategoryPie data colors innerRadius outerRadius onSelect />`. Each leaf chart shrinks to ~5 lines. Move the `GrowthChart` inline tooltip styles to import from `ChartTooltip.jsx`.
- **Risk**: Low — the variations are pure props. Be careful to preserve `Tooltip` formatter wiring (uses `useI18n`).

### MEDIUM `try { ... } catch (error) { res.status(500).json({ error: error.message }) }` envelope on every async route
- **Locations**: 11 occurrences across `server/index.js:78`, `server/routes/admin.js:41`, `server/routes/collection.js:207,234,258,278,355`, `server/routes/export.js:96`, `server/routes/import.js:404`, `server/routes/media.js:62`, `server/routes/stats.js:135`
- **Pattern**: Identical try/catch wrapper around every handler body, leaking raw `error.message`. The global error handler at `server/index.js:89-91` already does the same thing, so the per-handler wrappers are mostly redundant — they exist only because handlers are `async` and Express 4 doesn't auto-forward rejections.
- **Recommendation**: Add a 5-line `asyncHandler(fn)` wrapper in `server/middleware/asyncHandler.js` (`(req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`). Replace the per-handler try/catch with `router.get('/', asyncHandler(async (req,res) => { ... }))`. The existing global error middleware then handles the response.
- **Risk**: Two handlers (collection.js GET `/` and stats.js GET `/`) do not `return` after `res.status(500)` — behavior already matches `next(err)`. Confirm no handler relies on continuing after the 500 (none do).

### MEDIUM In-memory per-user job state maps duplicated with their own get/set helpers
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:12,20-45` (`syncStates`, `getSyncState`, `setSyncState`); `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:18,193-207` (`importSyncStates`, `getImportSyncState`, `setImportSyncState`)
- **Pattern**: Same shape — `Map<userId, state>` with a `get` that lazy-initialises a default and a `set` that spreads-and-merges. They diverge only on the initial-state object.
- **Recommendation**: A tiny `createUserStateStore(initialFactory)` factory in `server/lib/userStateStore.js` returning `{ get(userId), patch(userId, partial) }`. Both routes instantiate it with their respective default factory.
- **Risk**: Low. The two sites already use the same pattern; centralising it doesn't change semantics.

### MEDIUM Discogs notes-field-id resolution duplicated 3x
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:317-321`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:238-239`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:366-367`
- **Pattern**: Same nested ternary `currentNotes.find((n) => n.field_id === 3) ? 3 : currentNotes.length > 0 ? (currentNotes.at(-1).field_id || 3) : 3`. Followed each time by the same map/append logic to upsert the value into the notes array.
- **Recommendation**: `server/lib/discogsNotes.js` exporting `resolveNotesFieldId(notes)` and `upsertNote(notes, fieldId, value)`. Call sites become two lines.
- **Risk**: None — the three call sites are byte-identical other than naming.

### MEDIUM Discogs release detail enrichment block duplicated
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:139-168` (`enrichReleaseIfNeeded`); `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:391-409` (per-row enrich loop)
- **Pattern**: Both fetch `discogs.getRelease(release_id)` + `discogs.getMarketplaceStats(release_id, EUR).catch(() => null)`, take `priceEur = stats?.lowest_price?.value ?? 0`, and write back `estimated_value/country/tracklist` with very similar UPDATE SQL.
- **Recommendation**: Extract `fetchAndPersistEnrichment(db, discogs, { id, release_id, userId })` returning the priceEur/country/tracklist triple plus running the write. Both call sites use it.
- **Risk**: The two UPDATE statements differ slightly: `collection.js` writes `genres/styles/raw_json` too and uses overwrites; `sync.js` uses `COALESCE`/`CASE` to preserve existing values. The helper needs a mode flag (e.g. `{ overwriteAll: true }`) — still a net simplification.

### LOW Filename-driven `<a>` download trick repeated 4x
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/lib/exportImage.js:84-91,96-101,116-123`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/CoverWall.jsx:116-123`
- **Pattern**: `URL.createObjectURL(blob) -> create <a> -> append -> click -> remove -> revoke` boilerplate.
- **Recommendation**: One helper `triggerDownload(blobOrUrl, filename)` in `exportImage.js` (or new `src/lib/download.js`).
- **Risk**: Trivial; just be careful to keep `revokeObjectURL` for blob inputs only.

### LOW `format?.name || format` / `label?.name || label` mapper inlined 6x
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:106,110`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/export.js:47-48`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/CoverWall.jsx:62,69`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/lib/format.js:30-36` (`joinNames` already does this for the frontend, but isn't reused on the server)
- **Pattern**: Coercing a Discogs format/label entry that may be `{name: ...}` or a string.
- **Recommendation**: A shared `pickName(entry)` in `shared/discogs.js` (new) that both server and frontend `joinNames` can import. Server `getFilterOptions`, `serializeRelease` and `CoverWall` filter logic call it.
- **Risk**: None. Already a one-liner; consolidation just stops it drifting.

### LOW `locale === 'en' ? 'en-GB' : 'es-ES'` ternary in 3 formatters
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/lib/format.js:5,19,27`
- **Pattern**: Same locale -> Intl-locale mapping inline three times.
- **Recommendation**: Extract `intlLocale()` (no params, reads `getCurrentLocale()`) at the top of `format.js`.
- **Risk**: None.

### LOW `normalizeRateCurrency` duplicates `normalizeCurrency`
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/services/exchangeRates.js:30-33` vs `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/shared/currency.js:4-7`
- **Pattern**: The local `normalizeRateCurrency` does `String(value).trim().toUpperCase()` with a fallback — same as `normalizeCurrency` from `shared/currency.js`, which is already imported in the same file. The only difference is `normalizeRateCurrency` doesn't constrain to `SUPPORTED_CURRENCIES`, which matters for the `extraCurrencies` arg in `getExchangeSnapshot` (Discogs may return any 3-letter code).
- **Recommendation**: Either (a) add an `{ allowAny: true }` option to `shared/currency.normalizeCurrency`, or (b) keep the local helper but rename it to `normalizeAnyCurrency` and inline-document why it bypasses the allowlist. The latter is enough; the duplication is small but the *name* `normalizeRateCurrency` collides conceptually with `normalizeCurrency`.
- **Risk**: Low. Easy to introduce a regression if you forget the allowlist bypass — pick option (b) unless you want to broaden the shared helper.

### LOW Polling state machine in `SyncButton` and `ImportButton`
- **Locations**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/SyncButton.jsx:30-53,93-111`, `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/ImportButton.jsx:23-36`
- **Pattern**: All three poll loops use the same `disposed.current` guard + `setTimeout(self, POLL_MS)` recursive pattern, varying only in which API endpoint and which "still running?" predicate.
- **Recommendation**: A `usePolling(fetcher, { isRunning, intervalMs, onComplete })` hook in `src/hooks/usePolling.js`. Each component supplies the fetcher and `isRunning` predicate.
- **Risk**: Medium — `SyncButton` has nuanced toast-once-on-completion logic (`syncToastShown` / `enrichToastShown` refs). The hook needs to expose status transitions cleanly. If a clean abstraction proves elusive, leave as-is.
