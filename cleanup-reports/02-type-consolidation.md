# Type Consolidation Findings

## Summary

The codebase is plain JavaScript (no TypeScript, no Zod/valibot/yup, no JSDoc `@typedef` blocks). There are therefore zero formal type definitions to dedupe in the strict sense the task brief assumes. What does exist, and what this report focuses on, is **shape duplication**: the same object contracts are recreated by hand at multiple boundaries (DB row → API response → client state → import preview → tests), and several control-plane constants (column whitelists, default filters, currency labels, settings keys, status enums) are duplicated across client and server with no shared module. The single existing shared module is `shared/` (only `currency.js` and `i18n.js` live there) and it is the natural home for new shared contracts. Total notable duplications: **15 distinct shape/constant clusters** (5 HIGH, 6 MEDIUM, 4 LOW). The biggest risk is that the client column model (`src/lib/columns.js`) and the server sort whitelist (`server/routes/collection.js`) can drift silently, and that the Release row contract is reconstructed in ~6 places (db.js, sync.js, collection.js, export.js, import.js, inventory test).

## Existing type-organisation map

- `shared/currency.js` — only true cross-cut module today (`SUPPORTED_CURRENCIES`, `DEFAULT_CURRENCY`, `normalizeCurrency`). Used by both `src/` and `server/`.
- `shared/i18n.js` — translation strings only, no shapes.
- `src/lib/columns.js` — client-only column metadata (drives table render + sort).
- `src/lib/api.js` — un-typed fetch wrapper; response shapes are implicit per call site.
- `server/db.js` — DDL string + hand-rolled `hydrateRelease` mapper that is the *de facto* canonical Release shape.
- `server/services/exchangeRates.js` — re-exports `shared/currency.js` (mild redundancy: `server/routes/sync.js` imports currency constants via `services/exchangeRates.js`, while `src/lib/AuthContext.jsx` and `server/routes/account.js` import directly from `shared/currency.js`).
- No `src/types/`, `src/schemas/`, or `server/types/` directories exist.

## Findings (ranked by impact)

### [HIGH] Release row shape recreated across DB, sync, collection, export, import and tests
- **Duplicated/drifted types**:
  - `server/db.js:56-84` (DDL `releases_v2`), `server/db.js:282-297` (`hydrateRelease` — JSON-decoded canonical shape with `notes_text`)
  - `server/routes/collection.js:10-36` (`BASE_FIELDS` SELECT-list literal, used 4×)
  - `server/routes/sync.js:47-67` (`mapCollectionItem` — Discogs `basic_information` → DB row)
  - `server/routes/export.js:46-70` (`serializeRelease` — DB row → flat export row)
  - `server/routes/import.js:104-149` (`findRelease` SELECT + `change` shape that mirrors a partial Release)
  - `tests/inventory-sync.test.js:18-32` (re-declares the `releases` table inline)
  - Client consumers in `src/components/CollectionTable.jsx`, `src/pages/ReleaseDetail.jsx`, `src/pages/Collection.jsx`, `src/components/CoverWall.jsx`, `src/components/RandomReleaseCard.jsx` all destructure ad-hoc fields (`release_id`, `instance_id`, `cover_url`, `notes_text`, `tracklist`, `listing_status`, `listing_price`, `estimated_value`, `detail_cover_url`, `wall_cover_url`, `poster_cover_url`).
- **Differences**: Drifted, not identical — server `Release` includes `raw_json`, `synced_at`, `folder_id`, `user_id`; client never reads them. Cover-variant URLs (`detail_cover_url`, `wall_cover_url`, `poster_cover_url`) are spliced in by 3 different routes (`/collection`, `/collection/:id`, `/collection/random`, `/collection/covers`) and must be kept in lockstep. `notes_text` only exists on hydrated rows. `BASE_FIELDS` is a string literal that must match the schema.
- **Proposed location**: `shared/release.js` (or `shared/release.contract.js`) exporting:
  - `RELEASE_DB_COLUMNS` array (single source of truth replacing `BASE_FIELDS`)
  - `RELEASE_JSON_FIELDS = ['genres','styles','formats','labels','notes','tracklist']`
  - `attachCoverUrls(release)` helper so the 4 routes stop hand-spreading the same 3 URLs
  - JSDoc `@typedef Release` block so editors give autocomplete client- and server-side
- **Migration notes**: Mostly import-only on server; client consumers need no change but get IDE help. `BASE_FIELDS` is consumed in 4 query-string interpolations in `server/routes/collection.js` — feed it as `RELEASE_DB_COLUMNS.join(', ')`. Tests should import the DDL from a shared schema constant rather than redeclaring.
- **Risk**: Low — server-only constants don't reach the bundle. Care needed because `BASE_FIELDS` appears inside SQL string templates (audit each call site).

### [HIGH] Sortable-column whitelist split between client and server
- **Duplicated/drifted types**:
  - `server/routes/collection.js:180` — `validSort = new Set(['artist', 'title', 'year', 'rating', 'date_added', 'estimated_value', 'listing_price_eur'])`
  - `src/lib/columns.js:1-14` — `COLUMNS[].sortColumn` produces the implicit superset `['artist','title','year','rating','estimated_value','listing_price_eur']`
- **Differences**: Server allows `date_added` which the client never offers; client offers no key the server rejects. They will silently drift the next time anyone adds a sortable column on either side.
- **Proposed location**: `shared/releaseSort.js` — `export const SORTABLE_COLUMNS = ['artist','title','year','rating','date_added','estimated_value','listing_price_eur']`. `src/lib/columns.js` maps display columns to one of these keys; `server/routes/collection.js` checks against this set.
- **Migration notes**: Pure import swap. Fixes a real drift (the client cannot sort by `date_added` even though the server supports it).
- **Risk**: Negligible.

### [HIGH] Filter contract `{ search, genre, style, decade, format, label }` redefined 5×
- **Duplicated/drifted types**:
  - `src/pages/Collection.jsx:18-25` (`DEFAULT_FILTERS`) and `:33-42` (`getFiltersFromSearchParams`)
  - `src/components/CoverWall.jsx:10-17` (identical `DEFAULT_FILTERS`)
  - `server/routes/collection.js:46-88` (`buildCollectionWhere`)
  - `server/routes/export.js:12-44` (`buildWhere` — same query keys minus `style`)
  - `server/routes/media.js:157-173` (inline in `/tapete` handler — same 6 keys)
- **Differences**: `export.js` silently omits the `style` filter; the other two server endpoints handle it. Client and server agree on key names but the contract is enforced only by convention.
- **Proposed location**:
  - `shared/collectionFilters.js` — `export const DEFAULT_FILTERS = { search:'', genre:'', style:'', decade:'', format:'', label:'' }` and a `parseFiltersFromQuery(query)` helper.
  - `server/lib/buildReleaseWhere.js` — single SQL builder consumed by `collection.js`, `export.js`, `media.js`.
- **Migration notes**: Fixes the export-vs-collection style-filter drift. Client side is import-only; server side replaces three near-identical functions with one.
- **Risk**: Low. SQL builder consolidation is covered more deeply in report 03 (logic dedup); this report focuses on the *shape* sharing.

### [HIGH] Sync / progress state shape recreated ~10×
- **Duplicated/drifted types**:
  - `server/routes/sync.js:22-34` (collection sync state), `:191-196` (thumbnails), `:308-314`, `:320-325`, `:339-344`, `:347-353` (more thumbnails), `:376`, `:383`, `:417-423`, `:431-440`, `:444` (enrichment)
  - `server/routes/import.js:193-203` (import sync state)
  - Client mirror in `src/components/SyncButton.jsx:11-23, 85-91` and `src/components/ImportButton.jsx:14-18, 91-93` consumes `{ status, current, total, message, phase, enrichment, thumbnails }` with `status ∈ {idle, running, completed, failed}` and `phase ∈ {idle, initializing, downloading, ready, error}`.
- **Differences**: Identical core shape `{ status, current, total, message }`, with optional `phase` on the top-level sync. `enrichment` adds `pending`. None of these enums are named anywhere — `'For Sale'` / `'Draft'` listing status, sync `status` and `phase` strings are repeated as bare literals.
- **Proposed location**: `shared/progress.js` exporting:
  - `SYNC_STATUS = { IDLE:'idle', RUNNING:'running', COMPLETED:'completed', FAILED:'failed' }`
  - `SYNC_PHASE = { IDLE:'idle', INITIALIZING:'initializing', DOWNLOADING:'downloading', READY:'ready', ERROR:'error' }`
  - `LISTING_STATUS = { FOR_SALE:'For Sale', DRAFT:'Draft' }`
  - `createProgressState({ status, current=0, total=0, message='' })` factory used by both `sync.js` and `import.js`.
- **Migration notes**: Mostly server-side cleanup. Client consumers can import the enum constants for comparison (`status === SYNC_STATUS.RUNNING`) which removes a class of typo bugs.
- **Risk**: Low. Polling client and server must agree on string values — using a shared module enforces that.

### [HIGH] Account / `/api/account` response shape duplicated across client and server
- **Duplicated/drifted types**:
  - `server/routes/account.js:18-25` (`serializeAccount` — `{ discogsUsername, tokenConfigured, tokenPreview, currency }`)
  - `src/lib/AuthContext.jsx:22, 54, 72` — fallback object literal `{ tokenConfigured: false, currency: DEFAULT_CURRENCY }` repeated 3×
  - `src/pages/Settings.jsx:271-282` — destructures `account.discogsUsername`, `account.tokenPreview`, `account.tokenConfigured` into separate `useState` calls
- **Differences**: Identical contract; the repeated fallback in `AuthContext` is a maintenance hazard (adding a field means updating 3 spots).
- **Proposed location**: `shared/account.js` exporting `EMPTY_ACCOUNT = { discogsUsername:'', tokenConfigured:false, tokenPreview:null, currency:DEFAULT_CURRENCY }`. `AuthContext` and `Settings` import it; server `serializeAccount` returns shapes that match it.
- **Migration notes**: Pure import; collapses the 3 inline fallbacks.
- **Risk**: None.

### [MEDIUM] Settings/preference key whitelist duplicated
- **Duplicated/drifted types**:
  - `server/routes/account.js:68-71` — `ALLOWED_PREFERENCE_KEYS = new Set(['collection_visible_columns', 'currency'])`
  - `src/pages/Collection.jsx:83, 157` and `src/lib/AuthContext.jsx:78` — string literals `'collection_visible_columns'`, `'currency'` referenced individually
  - `server/db.js`/`server/routes/sync.js` use `'collection_value'`, `'last_collection_sync_at'` (settings stored but not preferences)
- **Differences**: Server enforces the whitelist; client just hopes it stays in sync.
- **Proposed location**: `shared/preferences.js` — `export const PREFERENCE_KEYS = { COLLECTION_VISIBLE_COLUMNS:'collection_visible_columns', CURRENCY:'currency' }` and `export const SETTING_KEYS = { COLLECTION_VALUE:'collection_value', LAST_SYNC_AT:'last_collection_sync_at' }`.
- **Migration notes**: Import-only.
- **Risk**: None.

### [MEDIUM] Currency labels separated from `SUPPORTED_CURRENCIES`
- **Duplicated/drifted types**:
  - `shared/currency.js:1` — `SUPPORTED_CURRENCIES = ['EUR','USD','GBP']`
  - `src/pages/Collection.jsx:27-31` — `CURRENCY_LABELS = { EUR:'EUR · €', USD:'USD · $', GBP:'GBP · £' }`
- **Differences**: Two parallel arrays/maps that must stay in sync. Adding `JPY` requires touching both.
- **Proposed location**: Replace `SUPPORTED_CURRENCIES` in `shared/currency.js` with a single `CURRENCIES = [{ code, label, symbol }, …]` and derive `SUPPORTED_CURRENCIES` from it.
- **Migration notes**: Slightly broader — `server/services/exchangeRates.js` iterates `SUPPORTED_CURRENCIES`; preserve the derived export.
- **Risk**: None.

### [MEDIUM] Discogs API response shapes typed implicitly at every call site
- **Duplicated/drifted types**:
  - `server/discogs.js:65-121` (`DiscogsClient` methods return raw JSON)
  - `server/routes/sync.js:47-67` reads `item.basic_information.{id,title,artists,year,genres,styles,formats,labels,cover_image,thumb}` and `item.{instance_id, rating, notes, date_added, folder_id}`
  - `server/routes/sync.js:243-258` reads `listing.{release.id, status, price.{currency,value}}` (also re-derived in `tests/inventory-sync.test.js:54-67`)
  - `server/routes/sync.js:394` and `server/routes/collection.js:147` read `stats.lowest_price.value`
  - `server/routes/collection.js:160-167` reads `detail.{genres, styles, country, tracklist}` from `getRelease`
- **Differences**: Each consumer re-reaches into the Discogs payload with `?.` chains — drift hazard if the API ever changes.
- **Proposed location**: `server/discogs/types.js` (server-only — these never need to reach the bundle) with JSDoc `@typedef` blocks for `DiscogsCollectionItem`, `DiscogsListing`, `DiscogsMarketplaceStats`, `DiscogsRelease`, plus small adapter functions (`extractListing(listing)`) so the test and `sync.js` share one extractor.
- **Migration notes**: Server-only. Adapter functions also remove the duplication between `sync.js:243-271` and `tests/inventory-sync.test.js:48-88`.
- **Risk**: None for bundle; medium development effort because each adapter needs unit coverage.

### [MEDIUM] Import "change" preview shape implicit between server and client
- **Duplicated/drifted types**:
  - `server/routes/import.js:136-149` — `change = { dbId, releaseId, instanceId, artist, title, currentRating, newRating, ratingChanged, currentNotes, newNotes, notesChanged, hasChanges }`
  - `src/components/ImportButton.jsx:186-213` — destructures `change.{dbId, artist, title, ratingChanged, currentRating, newRating, notesChanged, currentNotes, newNotes}`
  - Preview wrapper `{ previewId, totalRows, matched, withChanges, unmatched, changes, unmatchedRows, errors, message }` (`server/routes/import.js:301-332` ↔ `src/components/ImportButton.jsx:60-66, 137-225`)
- **Differences**: Identical, but neither side names them. Adding a column would mean editing both files.
- **Proposed location**: `shared/import.js` — JSDoc `@typedef` for `ImportChange` and `ImportPreview`, plus a `createChange(release, currentNotesText)` factory used server-side. Optionally export `IMPORT_PHASES = ['idle','loading','preview','applying','syncing','done','error']` since the client maintains those literally.
- **Migration notes**: Server-side factory is a small refactor; client just imports the typedef. The import phase enum on `ImportButton.jsx:14` is currently expressed as a comment — move it to the shared module.
- **Risk**: None.

### [MEDIUM] Listing entry shape recreated in production code and test
- **Duplicated/drifted types**:
  - `server/routes/sync.js:253-258` — `entry = { status, price, currency, priceEur }`
  - `tests/inventory-sync.test.js:62-67` — identical `entry` object literally reproduced
  - DB columns `listing_status`, `listing_price`, `listing_currency`, `listing_price_eur` (`server/db.js:74-77`) and the full conditional update query repeated in three places.
- **Differences**: None — verbatim.
- **Proposed location**: Extract `selectBestListing(listings, rates)` into `server/lib/inventory.js`; the test imports the real function instead of reimplementing it.
- **Risk**: None.

### [MEDIUM] Stats response shape consumed by 7+ client modules with no central definition
- **Duplicated/drifted types**:
  - `server/routes/stats.js:112-133` — produces `{ totals:{total_records, total_value, rated_records, notes_records, priced_records}, genres, decades, formats, labels, styles, growth, topValue, artists, lastSync, displayCurrency }`
  - `src/lib/achievements.js:162-179` reads `stats.totals.*`, `stats.decades.length`, `stats.styles.length`, `stats.labels.length`, `stats.growth.length`, `stats.artists`, `stats.genres`
  - `src/pages/Dashboard.jsx:144-282` reads almost all top-level fields plus deeply into `totals.*`, `lastSync.{finished_at, records_synced}`, `growth.length`, `artists[0].{count,artist}`, `genres[0].{name,count}`
  - Each `src/components/charts/*Chart.jsx` consumes `data: {name, count}[]`
- **Differences**: All readers agree, but adding/removing a totals counter requires patching `stats.js` + `achievements.js` + `Dashboard.jsx` in lockstep.
- **Proposed location**: `shared/stats.js` exporting `TOTALS_KEYS = ['total_records','total_value','rated_records','notes_records','priced_records']` and JSDoc `@typedef Stats`. Charts could share a `ChartDatum = {name:string, count:number}` typedef.
- **Migration notes**: Import-only.
- **Risk**: None.

### [LOW] `change.notes`/`field_id===3` heuristic duplicated
- **Duplicated/drifted types**:
  - `server/routes/import.js:237-245` and `:362-372`
  - `server/routes/collection.js:308-336`
  - All compute `notesFieldId = currentNotes.find(n => n.field_id === 3) ? 3 : currentNotes.length > 0 ? currentNotes[currentNotes.length-1].field_id || 3 : 3`
- **Differences**: Identical logic; `field_id === 3` magic number is the implicit Discogs "Notes" custom field.
- **Proposed location**: Extract to `server/lib/discogsNotes.js` exporting `NOTES_FIELD_ID = 3` and `pickNotesFieldId(currentNotes)`.
- **Risk**: None.

### [LOW] Currency-imports inconsistent
- **Duplicated/drifted types**:
  - Some files import `DEFAULT_CURRENCY` from `shared/currency.js` (`src/lib/AuthContext.jsx:3`, `src/pages/Collection.jsx:16`, `server/routes/account.js:4`).
  - Others import the same constant via `server/services/exchangeRates.js`'s re-export (`server/routes/sync.js:6`, `server/routes/stats.js:4`, `server/routes/export.js:6`, `server/routes/collection.js:4`, tests).
- **Differences**: Same value, two import paths.
- **Proposed location**: Drop the re-export at `server/services/exchangeRates.js:144` and have all callers import directly from `shared/currency.js`.
- **Risk**: Trivial; just a search-and-replace in 5 server files.

### [LOW] User-summary shape duplicated
- **Duplicated/drifted types**:
  - `server/routes/auth.js:8-10` — `sanitizeUser(user) → { id, username, role, created_at }`
  - `server/routes/admin.js:10-19` — listing maps each user to `{ id, username, role, created_at }` again
  - `server/db.js:317, 330` — SELECT lists `id, username, role, created_at` directly from SQL
  - Client consumers `src/pages/Settings.jsx:121-130` and `src/lib/AuthContext.jsx:9, 47` read `user.{id, username, role, created_at}`.
- **Differences**: Identical projection. No risk of secret leakage today, but the sanitizer exists for that reason — duplicating the field list defeats the safety net.
- **Proposed location**: `server/lib/userView.js` exporting `USER_PUBLIC_COLUMNS = 'id, username, role, created_at'` and `serializeUser(user)`. Use it in `db.js`, `auth.js`, `admin.js`.
- **Risk**: None.

### [LOW] Cover-variant configuration only declared server-side
- **Duplicated/drifted types**:
  - `server/routes/media.js:22-27` — `VARIANTS = { detail, wall, tapete, poster }` with width/quality.
  - URL-builders for those variants spliced into 4 routes (`/collection`, `/collection/:id`, `/collection/random`, `/collection/covers`) as `${base}?variant=detail` etc.
  - Client uses `release.detail_cover_url`, `release.wall_cover_url`, `release.poster_cover_url` (`src/components/CoverWall.jsx:206-236`, `src/pages/ReleaseDetail.jsx:106`, `src/components/RandomReleaseCard.jsx:73`) — no enum, just strings.
- **Differences**: No drift today, but client-side variant strings are unverified against `VARIANTS`.
- **Proposed location**: `shared/coverVariants.js` exporting `COVER_VARIANTS = ['detail','wall','tapete','poster']`. Server keeps the width/quality config private; client uses the enum to build/validate URL-builder helpers.
- **Risk**: None.
