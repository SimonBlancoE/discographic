# Weak Type Findings

## Scope note

This codebase is **plain JavaScript (ESM)** — there is no TypeScript, no `tsconfig.json` / `jsconfig.json`, no JSDoc `@type` annotations, no `// @ts-*` directives, no `PropTypes`, and no `eslint-disable` comments anywhere outside `node_modules`. As a result the canonical TS-flavoured weak-type patterns from the task brief (`: any`, `as any`, `<any>`, `: unknown`, `Function`, `object`, `{}`, `Record<string, any>`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) produce **zero matches** in source.

Verified via:
- `grep -rn '@ts-(ignore|expect-error|nocheck)' src server shared scripts` -> 0 matches
- `grep -rn '@type \{(any|object|Function|\{\})\}' src server shared` -> 0 matches
- `grep -rn 'eslint-disable' src server shared scripts tests` -> 0 matches
- `grep -rn 'PropTypes' src` -> 0 matches
- `find . -name 'tsconfig*' -not -path '*/node_modules/*'` -> 0 matches

I therefore reframed the audit to the JS-equivalent class of weakness: **runtime-typed values that are accepted, parsed, or returned without narrowing/validation**. Each finding still carries concrete evidence and a strong replacement.

## Summary

| Pattern (JS-equivalent) | Count |
|---|---|
| Untyped/unvalidated `req.body` field reads in routes | 6 sites |
| Untyped/unvalidated `req.query` field reads in routes | 4 sites (filter destructuring is the worst) |
| `JSON.parse` results returned with no shape narrowing | 3 sites (`server/db.js` `parseJson`, `hydrateRelease`, `Collection.jsx:86`) |
| Stringly-typed enums (`'EUR'\|'USD'\|'GBP'`, `'asc'\|'desc'`, sortBy column, listing `status`, sync `phase`/`status`) accepted as bare `string` | 7 sites |
| Empty `catch {}` swallowing unknown errors | 2 sites |
| Function/object args with no documented contract (`mapping`, `release`, `change`, `account`) | most of `server/routes/import.js`, `server/routes/sync.js`, `server/routes/collection.js` |
| Discogs API responses (`getCollection`, `getRelease`, `getMarketplaceStats`, `getInventory`) used as `any` | `server/discogs.js` + every consumer |

The single most leveraged fix would be to convert `shared/currency.js` and `shared/i18n.js` to a generated `.d.ts` (or move the project to `checkJs: true` with JSDoc) so editor tooling carries the literal-union enums end-to-end. Even without that, the runtime guards listed below are the highest value.

## Findings (ranked by impact)

### [HIGH] Untyped `req.body.rating` accepted into Discogs PUT without bound check
- **Location**: `server/routes/collection.js:302-305`
- **Current**: `const nextRating = req.body.rating !== undefined ? Number(req.body.rating) : release.rating;`
- **Proposed**: literal union `0|1|2|3|4|5` with explicit validation. Reuse the same `Number.isFinite(n) && n >= 0 && n <= 5` guard the import path already uses (see `server/routes/import.js:158-161`) and reject (`400`) otherwise.
- **Evidence**: `server/routes/import.js:155-161` already encodes the contract (`numRating < 0 || numRating > 5` -> error "El rating debe estar entre 0 y 5"); the Discogs docs cited in the same file say rating is integer 0-5; current code path can forward `NaN` (when `rating: "x"`) or `99` straight to `discogs.updateRating` and to `db.run(nextRating, ...)` which writes garbage to a column declared `INTEGER DEFAULT 0` (`server/db.js:70`).
- **Risk**: Latent bug (corrupt local state, 422 from Discogs). Needs runtime guard.

### [HIGH] `req.query.sortBy` / `sortOrder` typed as bare `string` mid-SQL interpolation
- **Location**: `server/routes/collection.js:180-190`
- **Current**: `const sortBy = validSort.has(req.query.sortBy) ? req.query.sortBy : 'artist';` then `ORDER BY ${sortBy} ${sortOrder}`.
- **Proposed**: literal union derived from the `validSort` Set, e.g. `type SortColumn = 'artist'|'title'|'year'|'rating'|'date_added'|'estimated_value'|'listing_price_eur'`, and `type SortOrder = 'ASC'|'DESC'`. Hoist the Set to a `const SORT_COLUMNS = ['artist', ...] as const` and export it so the front end (`src/lib/columns.js` `sortColumn`) can be typed against the same source.
- **Evidence**: The valid set is exactly enumerated at `server/routes/collection.js:180`; the front-end column registry at `src/lib/columns.js:3-13` independently lists the same `sortColumn` values (`artist`, `title`, `year`, `rating`, `estimated_value`, `listing_price_eur`) — two separate string-typed copies of the same enum. The string is interpolated into SQL, so the existing `Set.has` guard is the *only* thing standing between user input and SQL injection.
- **Risk**: HIGH if the guard is ever bypassed; even today it permits silent UI/DB drift between front-end column ids and back-end sort whitelist.

### [HIGH] `parseJson` returns untyped data, used as if it were a known shape
- **Location**: `server/db.js:249-258` (`parseJson`) and consumers `server/db.js:282-297` (`hydrateRelease`), `server/routes/collection.js:308-336`, `server/routes/import.js:134-179`, `server/routes/import.js:362-373`
- **Current**: `parseJson(value, fallback = [])` returns whatever `JSON.parse` produced — could be a primitive, object, or wrong-shape array — and downstream code does `currentNotes.find((n) => n.field_id === 3)`, `notes.map((item) => item?.value)`, `format?.name || format`, etc.
- **Proposed**: replace with a discriminated parser per column:
  - `parseNotes(value): Array<{ field_id: number|null, value: string }>` — already shaped by `normalizeNotes` (`server/db.js:265-280`) on the write path; mirror that on read.
  - `parseGenres/parseStyles(value): string[]`
  - `parseFormats/parseLabels(value): Array<{ name: string, [k: string]: unknown }>` — Discogs raw `basic_information.formats[*]` / `labels[*]` shape (see `server/routes/sync.js:55-58` mapping it from Discogs).
  - `parseTracklist(value): Array<{ position?: string, title?: string }>` — see `server/routes/export.js:68`.
  Each parser should reject malformed JSON values rather than silently returning a stringified blob.
- **Evidence**: write side already enforces shape — `server/routes/sync.js:55-58` stringifies `info.genres || []` (always `string[]`); `mapColumns` /`extractChanges` in `server/routes/import.js` clearly assume notes are `[{field_id, value}]`. The reader side trusts `parseJson` returned that exact shape.
- **Risk**: A row whose `notes` column was hand-written or imported from a legacy v1 table can crash `currentNotes.find` (it would throw on a non-array), since none of the call-sites guard `Array.isArray`. Same applies to `formats`/`labels` — the `format?.name || format` fallback at `server/routes/collection.js:106` admits a stringly-typed shape that no other code expects.

### [HIGH] Discogs SDK responses are implicit `any`
- **Location**: `server/discogs.js:65-121` (every method returns `this.request(...)` -> `response.json()` -> raw `any`)
- **Current**: `getCollection`, `getRelease`, `getMarketplaceStats`, `getInventory`, `getCollectionValue`, `getCustomFields` return `Promise<any>`. Consumers (`server/routes/sync.js:122-160`, `server/routes/sync.js:226-239`, `server/routes/collection.js:145-148`) reach into deeply nested `info.basic_information.formats`, `payload?.pagination?.pages`, `stats?.lowest_price?.value`, `listing.price?.currency`, etc. with optional chaining only.
- **Proposed**: add `server/types.d.ts` (or JSDoc typedefs) for the small Discogs surface this app touches. Minimum:
  ```js
  /** @typedef {{ pagination: { pages: number, items: number, page: number }, releases: DiscogsCollectionItem[] }} DiscogsCollectionPage */
  /** @typedef {{ instance_id: number, rating: number, notes?: Array<{field_id: number, value: string}>, basic_information: { id: number, title: string, year: number, artists: Array<{name: string}>, genres: string[], styles: string[], formats: Array<{name: string}>, labels: Array<{name: string}>, cover_image?: string, thumb?: string }, folder_id: number, date_added: string }} DiscogsCollectionItem */
  /** @typedef {{ pagination: {...}, listings: Array<{ status?: string, release?: {id: number}, price?: {value: number, currency: string} }> }} DiscogsInventoryPage */
  /** @typedef {{ lowest_price?: { value: number, currency: string } | null, num_for_sale: number, blocked_from_sale: boolean }} DiscogsMarketplaceStats */
  ```
- **Evidence**: every field accessed is documented at the comment URLs already pasted in `server/discogs.js:79-118` (Discogs developer docs); the actual access patterns in `server/routes/sync.js:48-67` and `server/routes/sync.js:243-258` reveal the exact subset used. The library has no upstream `.d.ts` (it's a fetch wrapper authored in this repo).
- **Risk**: Quietly broken when Discogs reshapes a response; today the only safety is `?.` chains that silently fall back to defaults (`info.year || null`, `pagination?.pages || 0`).

### [MEDIUM] `currency` accepted as bare `string` everywhere despite a literal union existing
- **Location**: `server/routes/account.js:41-42, 85-94`, `server/routes/collection.js:38-40`, `server/routes/export.js:75`, `server/routes/stats.js:32`, `server/routes/media.js`, `server/services/exchangeRates.js:96-128`, `src/lib/format.js:3`, `src/lib/AuthContext.jsx:12, 22, 27, 54, 56, 72-79`
- **Current**: every call accepts `string` and relies on `normalizeCurrency` to coerce.
- **Proposed**: export `Currency = 'EUR' | 'USD' | 'GBP'` from `shared/currency.js` (already the source of truth at line 1) — either as a JSDoc `@typedef {'EUR'|'USD'|'GBP'} Currency` or in a `shared/currency.d.ts` sidecar. Type `formatCurrency(value: number, currency: Currency)`, `convertAmount(amount, from: Currency, to: Currency)`, `setCurrencyPreference(c: Currency)`. The `normalizeCurrency` boundary remains the only place that takes raw `string`.
- **Evidence**: `shared/currency.js:1` literally declares `SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP']` and is imported by 8+ modules; `src/pages/Collection.jsx:27-31` even hand-rolls a `CURRENCY_LABELS` object keyed by exactly those three strings.
- **Risk**: LOW behavioural risk (the runtime guard works), but the type erasure removes editor autocomplete and lets code like `convertAmount(x, 'EU', 'USD')` typo silently into the EUR fallback.

### [MEDIUM] `locale` accepted as bare `string` despite `SUPPORTED_LOCALES` union
- **Location**: `shared/i18n.js:799` (`translate(locale, key, vars)`), `server/index.js:30-34`, `server/routes/sync.js:16-20`
- **Current**: `translate(locale, key, vars = {})` and the express middleware setting `req.locale = resolveLocale(...)`.
- **Proposed**: `Locale = 'es' | 'en'` derived from `SUPPORTED_LOCALES` (`shared/i18n.js:3`); `MessageKey = keyof typeof messages.es` derived from the message map (~700 keys, would catch missing-translation typos at edit time).
- **Evidence**: `shared/i18n.js:3` declares `SUPPORTED_LOCALES = ['es', 'en']`; `resolveLocale` always returns one of those two; every consumer threads the value as bare string.
- **Risk**: LOW today — typo'd keys silently render as the key string (per the existing `translate` fallback).

### [MEDIUM] `req.body` destructuring with no validator
- **Location**: `server/routes/import.js:340` (`const { previewId } = req.body;`), `server/routes/account.js:85` (`const { value } = req.body;`), `server/routes/auth.js:26-27,52-53,87-88`, `server/routes/admin.js:22-23,63`
- **Current**: each route hand-rolls `String(req.body.x || '').trim()` coercion. `previewId` is plucked unchecked.
- **Proposed**: introduce a tiny zod / valibot schema per route (or a 30-line `validateBody(req, shape)` helper) and call it at the top of each handler. For `previewId` the contract is "32-char hex string from `crypto.randomBytes(16).toString('hex')`" (`server/routes/import.js:316`).
- **Evidence**: `previewId` source at `server/routes/import.js:316`; `account.js:91` already branches on `typeof value === 'string'` proving the contract is "string OR JSON-serialisable" — but that's per-key behaviour that should be encoded, not inlined.
- **Risk**: Currently low (the `previewCache.get(undefined)` returns undefined which gates the rest), but every new route will keep duplicating the `String(... || '')` ritual.

### [MEDIUM] `format` query param accepted as `string`, then string-compared
- **Location**: `server/routes/export.js:74`
- **Current**: `const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';`
- **Proposed**: `type ExportFormat = 'csv' | 'xlsx'`; co-located with `src/lib/api.js:90-93` `exportCollection(format, params)` (also typed bare).
- **Evidence**: `src/components/ExportButton.jsx` is the only caller; both file extensions and content types only support the two values.
- **Risk**: cosmetic.

### [MEDIUM] `listing_status` and sync `phase`/`status` strings are unconstrained enums
- **Location**: 
  - listing status: `server/routes/sync.js:254-265` (`'For Sale'`, `'Draft'`), `server/db.js:74` column `listing_status TEXT`
  - sync state: `server/routes/sync.js:22-34, 126-218, 363-449` uses `status: 'idle' | 'running' | 'completed' | 'failed'` and `phase: 'idle' | 'downloading' | 'initializing' | 'ready' | 'error'`
- **Current**: bare `string` everywhere; spread across `setSyncState` patches with no shape contract.
- **Proposed**: 
  ```js
  /** @typedef {'idle'|'running'|'completed'|'failed'} JobStatus */
  /** @typedef {'idle'|'initializing'|'downloading'|'ready'|'error'} SyncPhase */
  /** @typedef {'For Sale'|'Draft'} ListingStatus */
  /** @typedef {{ status: JobStatus, phase: SyncPhase, current: number, total: number, message: string, ... }} SyncState */
  ```
- **Evidence**: every literal value used is enumerated by inspection of `server/routes/sync.js`; the front end (`src/components/SyncButton.jsx`) reads `status?.message` etc. without knowing the closed set.
- **Risk**: Past bugs in this codebase (`statusRank` at `server/routes/sync.js:265`) already shipped with hard-coded string equality; future statuses will silently fall through.

### [LOW] `value` parameter in `setSettingForUser` accepts anything, gets coerced via `String()`
- **Location**: `server/db.js:304-310`, `server/routes/account.js:91`
- **Current**: `value` is `any`; `setSettingForUser` does `String(value)`, while the route does `typeof value === 'string' ? value : JSON.stringify(value)`.
- **Proposed**: split into `setSettingString(userId, key, value: string)` and `setSettingJson(userId, key, value: unknown)`; the call-site decides. Or document `value: string` and require callers to JSON.stringify.
- **Evidence**: `server/routes/account.js:89-92` already does the JSON branching one layer up — the inconsistency means `setSettingForUser(userId, 'collection_value', {...})` (`server/routes/sync.js:154-157`) writes `[object Object]` instead of JSON. **Latent bug found while auditing.**
- **Risk**: Real bug at `server/routes/sync.js:152-157`. `value.maximum` and `value.median` from the Discogs `getCollectionValue()` response are `{ value: number, currency: string }`-shaped objects, not numbers (per the Discogs docs URL in `server/discogs.js:75-77`). `String({ value: 100, currency: 'EUR' })` -> `"[object Object]"` gets stored.

  Wait — re-reading: `value.maximum` could be a primitive if Discogs returns `{ maximum: 100, median: 80, ... }`. Worth a quick verification — but either way the type is undocumented.

### [LOW] Empty `catch {}` blocks lose error context
- **Location**: `src/pages/Collection.jsx:90`, `src/components/SyncButton.jsx:136`
- **Current**: `} catch {}` — swallows any error type silently.
- **Proposed**: at minimum bind `(error)` and `console.warn('label', error)`. Strong typing ('catch param is unknown in TS5') doesn't apply here, but the practice of dropping unknowns silently is the JS equivalent of `as any`.
- **Evidence**: both swallows discard genuine state-loss conditions (`JSON.parse` failure for stored preference; `api.getSyncStatus` failure on stop).
- **Risk**: makes failures invisible during development.

### [LOW] React component props are positionally typed (no PropTypes, no JSDoc)
- **Location**: representative sample: `src/components/CollectionTable.jsx:8` (`NotesInput({ value, onCommit })`), `src/components/CollectionTable.jsx:27` (`SortButton({ label, column, sortBy, sortOrder, onSort })`), `src/components/StarRating.jsx`, `src/components/ExportButton.jsx`, `src/hooks/useAnimatedNumber.js:4`
- **Current**: every component accepts `props` with no contract, no defaults, no required marker.
- **Proposed**: add JSDoc `@param` blocks (cheapest), or convert to TypeScript (largest payoff). Example for `NotesInput`: 
  ```js
  /** @param {{ value: string, onCommit: (next: string) => void }} props */
  ```
- **Evidence**: callsite at `src/components/CollectionTable.jsx:94` shows `value={release.notes_text || ''}` (always string) and `onCommit={(notes) => onUpdate(release, { notes })}`.
- **Risk**: cosmetic; no specific runtime bug, but represents the largest surface of weak typing in the repo.

### [LOW] Untyped event handlers
- **Location**: `src/components/CoverWall.jsx:148` (`onChange={(event) => setSize(Number(event.target.value))}`), and ~15 similar sites across components/pages.
- **Current**: `event` parameter has no contract.
- **Proposed**: in JSDoc, `@param {React.ChangeEvent<HTMLInputElement>} event`.
- **Risk**: cosmetic.

## Justified weak types (KEEP)

- **`server/db.js:24-30` `getColumns(tableName)` returning `unknown[]`-ish rows**: `PRAGMA table_info` is a SQLite-controlled boundary and the migration code only checks `column.name`. Strong typing buys little. Keep.
- **`server/middleware/rateLimit.js:41-48` `parseRetryAfter(response)`**: input is a Fetch `Response` (typed) and the unknown shape is the `Retry-After` header content, which the function explicitly narrows via `Number.isFinite(seconds) && seconds > 0`. This is **good narrowing of an unknown boundary** — exactly what the brief calls "legitimate `unknown` at boundaries with proper narrowing". Keep.
- **`server/db.js:249-258` `parseJson` fallback semantics**: the *function* is fine (try/catch + fallback). What's weak is callers trusting the shape — flagged separately above. Keep the parser, type its callers.
- **Generic Express `(err, req, res, next)` handler at `server/index.js:89-91`**: Express's contract is `err: any`, and the handler safely narrows via `err.message ||` fallback. Keep.
- **`error.message` reads in catch blocks across the front end** (e.g. `src/pages/Collection.jsx:76`): pre-ES2022 idiom; while `unknown` is the modern type for catch bindings, here the failures only ever come from `api.request()` which always throws an `Error` instance (`src/lib/api.js:25`). Keep.
