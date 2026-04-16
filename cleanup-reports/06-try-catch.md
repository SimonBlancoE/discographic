# Try/Catch & Defensive Code Findings

## Summary
- Total `try {}` blocks: 60
- `.catch(...)` chains: 19
- Recommended REMOVE: 19
- Recommended KEEP (boundary): 36 (route handlers, network IO, file IO, untrusted JSON)
- Recommended IMPROVE (add context, type the error, or stop swallowing): 24

(Counts above include both `try { } catch` blocks and `.catch(fn)` suppressions; some single locations appear in both REMOVE and IMPROVE buckets only because they fit a pattern that recurs many times.)

## Findings

### IMPROVE — Express handlers wrap the whole body in `try { ... } catch (e) { res.status(500).json({ error: e.message }) }`
- **Location**: `server/routes/collection.js:140`, `:175`, `:212`, `:239`, `:263`, `:283`; `server/routes/stats.js:30`; `server/routes/export.js:73`; `server/routes/admin.js:33`; `server/routes/media.js:30`, `:45`, `:120`, `:186`; `server/routes/sync.js:461`, `:511`; `server/routes/import.js:292`, `:339`; `server/index.js:73`.
- **Current behaviour**: every `router.get/post/put` body is wrapped to forward `error.message` as a 500 JSON. Every route forwards raw error strings (some of which embed Discogs response bodies).
- **Why classify this way**: a global error middleware is already installed at `server/index.js:89` that does the exact same thing (`res.status(500).json({ error: err.message })`). Per-route try/catch only duplicates that middleware *and* removes the chance to differentiate 4xx vs 5xx. It also leaks raw upstream error text (Discogs HTML/JSON) to the client.
- **Recommended change**: delete the `try/catch` and `return next(error)` (or rely on Express 5's auto-forward of rejected async handlers). Then beef up the global handler in `server/index.js:89` to map known error classes (`DiscogsError`, `ValidationError`, etc.) to status codes. This concentrates error policy in one place and stops `error.message` (which sometimes contains stack trace fragments) from being echoed.
- **Risk**: low — current behaviour is already 500 + `{error: message}`. The global middleware already exists; removing duplicates is behaviour-preserving.

### REMOVE — `.catch(() => null)` on internal Discogs-stats fetches that turns failures into `0`
- **Location**: `server/routes/sync.js:393`, `server/routes/collection.js:146`.
- **Current behaviour**: `discogs.getMarketplaceStats(...).catch(() => null)` then `stats?.lowest_price?.value ?? 0` — any 429, 500, or network error silently writes `0` into `releases.estimated_value`.
- **Why classify this way**: writing `0` corrupts the dataset. The user can't distinguish "Discogs has no listings" from "the request failed". Currency totals on the Dashboard will silently misreport.
- **Recommended change**: drop the `.catch(() => null)` and `?? 0`. On error, leave `estimated_value` `NULL` (skip the UPDATE) so the row stays in the enrichment queue and gets retried next sync.
- **Risk**: a temporary Discogs hiccup currently zeroes a record's value forever (until manually re-enriched). Removing the swallow surfaces the failure to retry logic.

### REMOVE — `.catch(() => ({ tokenConfigured: false, currency: DEFAULT_CURRENCY }))` on `api.getAccount()`
- **Location**: `src/lib/AuthContext.jsx:22`, `:54`, `:72`.
- **Current behaviour**: any failure to fetch the account (including 5xx and network errors) is silently turned into "no Discogs token / EUR currency" state. The user sees a "configure Discogs" prompt with no error.
- **Why classify this way**: this masks server outages and propagates a wrong currency preference (forces EUR). The outer `try/catch` at `:16-:34` already handles the broader failure case, so this nested suppression is redundant.
- **Recommended change**: drop the three `.catch(...)`s and let the outer `try/catch` (or a typed surfaced error) handle it. If a soft failure is genuinely desired, set an explicit `accountFetchError` state and render a banner.
- **Risk**: previously-silent backend errors will now surface as a top-level error UI; that's the goal.

### REMOVE — `await response.json().catch(...)` fallbacks in `src/lib/api.js`
- **Location**: `src/lib/api.js:24` and `:85`.
- **Current behaviour**: when an HTTP error response can't be parsed as JSON, fall back to `{ error: 'Error de red' }` / `{ error: 'Error generando tapete' }`.
- **Why classify this way**: the server *always* returns JSON for errors (see `app.use((err, req, res, next) => res.json(...))`). The only realistic path here is a proxy/CDN intercepting with HTML, which deserves a clearer message — but the current Spanish-only string also breaks i18n (the `Error de red` string is hardcoded Spanish, see `MEMORY.md` note about i18n).
- **Recommended change**: keep ONE catch (this is a real boundary at `response.json()`), but route through the i18n layer and include `response.status` in the message so the user sees `HTTP 502` rather than a generic localized lie.
- **Risk**: minor — UX wording change.

### REMOVE — Empty `catch {}` blocks that swallow polling failures
- **Location**: `src/components/SyncButton.jsx:48`, `:108`, `:136`, `:65`; `src/components/ImportButton.jsx:33`; `src/pages/Collection.jsx:90`.
- **Current behaviour**: failed `getSyncStatus()` / `getImportStatus()` polls retry forever via `setTimeout(poll, POLL_MS)` with no logging, no toast, no max-attempt counter; failed `setPreference` calls are ignored entirely; `JSON.parse` of stored visible-columns errors is swallowed silently.
- **Why classify this way**: empty catch blocks make the running app indistinguishable from a hung backend. The polling loops will spin forever even after the server is gone.
- **Recommended change**:
  - Polls: keep retry but cap attempts (e.g. 5 with exponential backoff), then surface a toast.
  - `setPreference`: at minimum `console.warn` so a developer can see preference loss in dev tools.
  - `JSON.parse`: log to console; the corrupt preference will then be evident on next save.
- **Risk**: low — surfaces existing problems instead of hiding them.

### REMOVE — `.catch(() => {})` on background `setPreference` and on the polling-status fetch
- **Location**: `src/pages/Collection.jsx:92`, `:157`; `src/components/SyncButton.jsx:65`.
- **Current behaviour**: silent suppression of a network call.
- **Why classify this way**: silently dropping the user's column-visibility preference (or initial sync status) creates "why didn't my settings save?" bug reports that are impossible to reproduce.
- **Recommended change**: either await the call and surface a toast, or log to telemetry. Don't ignore.
- **Risk**: low.

### KEEP — `try { JSON.parse(value) } catch { return fallback }` in `parseJson`
- **Location**: `server/db.js:254`.
- **Current behaviour**: parses untrusted JSON from the SQLite blob, falling back to `[]` (or caller-supplied default).
- **Why classify this way**: `JSON.parse` on stored data is a real boundary; data may have been corrupted by a previous bug or migration. Fallback is documented and call sites pass the desired default.
- **Recommended change**: keep, but log a warning when the fallback path triggers — silent corruption recovery hides bugs.
- **Risk**: none.

### KEEP — `try { new URL(...) } catch { return false / src }`
- **Location**: `server/routes/media.js:30` (`isAllowedRemote`), `src/lib/exportImage.js:4` (`buildProxyUrl`).
- **Current behaviour**: invalid URL strings are treated as "not allowed" / "use as-is".
- **Why classify this way**: `new URL` is the standard way to validate; throwing is the documented signal. The catch IS the validation result.
- **Recommended change**: keep as-is.
- **Risk**: none.

### KEEP — `try { await access(cachePath) } catch { /* miss, fetch instead */ }`
- **Location**: `server/routes/media.js:78`.
- **Current behaviour**: probe-for-existence using fs/promises `access`; throw means "not cached, go fetch".
- **Why classify this way**: `access` throws to signal "not found" — that *is* the API contract. Replacing with `existsSync` would also work.
- **Recommended change**: optionally swap to the synchronous `existsSync` for consistency with the rest of the file (`server/routes/media.js` already imports `existsSync`). No behavioural change needed.
- **Risk**: none.

### KEEP — Form-submit handlers in `Login.jsx`, `Setup.jsx`, `Settings.jsx`, `ReleaseDetail.jsx`, `Collection.jsx`, `Dashboard.jsx`
- **Location**: `src/pages/Login.jsx:19`, `src/pages/Setup.jsx:43`, `src/pages/Settings.jsx:23/39/58/77/222/290/351`, `src/pages/ReleaseDetail.jsx:33/55/70`, `src/pages/Collection.jsx:64/137/192`, `src/pages/Dashboard.jsx:204`, `src/components/RandomReleaseCard.jsx:26`, `src/components/AchievementsPanel.jsx:84`, `src/components/SyncButton.jsx:32/73/95/122/132`, `src/components/ImportButton.jsx:25/58/81`.
- **Current behaviour**: catch UI-action error, show a toast or set local error state, reset spinner.
- **Why classify this way**: this IS the boundary (user action → backend). They translate the error to user-visible UI and clear the loading flag in `finally`. Removing them would crash the React tree.
- **Recommended change**: keep, but consider extracting a small helper hook (`useAsyncAction`) — most of these are the same `setLoading(true) / try / catch / setError / finally setLoading(false)` ceremony.
- **Risk**: none.

### KEEP — Outer try around enrichment loop in `server/routes/sync.js:370` and inventory in `:221`
- **Current behaviour**: outer try/catch wraps the loop and on fatal error sets `state = 'failed'` with `error.message`; inner try/catch (line 391) per-row catches and `console.log`s before continuing.
- **Why classify this way**: this is a long-running background job; the outer one catches truly fatal exceptions and updates user-visible state. The inner one means "one bad release shouldn't kill the entire sync". Both are legitimate boundary handling.
- **Recommended change**: keep. But consider escalating after N consecutive failures (currently a flapping Discogs token would silently log thousands of `[enrich] error` lines).
- **Risk**: none.

### IMPROVE — Inner catch in `server/routes/sync.js:329-334` (thumbnail warmup) — `} catch { /* continue */ }`
- **Current behaviour**: empty catch around `ensureCachedCover`.
- **Why classify this way**: silently swallowing per-cover failures is correct policy, but logging would help debugging.
- **Recommended change**: add `console.warn('[thumbnail-warmup] failed', release.id, err.message)`. Same applies to `server/routes/media.js:213` (tapete builder).
- **Risk**: none — only adds log lines.

### IMPROVE — `server/routes/sync.js:151-160` — collection-value catch logs and continues
- **Current behaviour**: failure to fetch collection value just logs; sync proceeds.
- **Why classify this way**: this is acceptable but the surfacing should be in `setSyncState` so the user sees "Could not fetch valuation" rather than only the developer seeing it in the server log.
- **Recommended change**: stash the message into the next `setSyncState` so the UI can display it.
- **Risk**: none.

### IMPROVE — `server/routes/sync.js:198-206` and `:208-217` — background `.catch` updates state but loses error trace
- **Current behaviour**: `await syncInventory(...).catch((error) => { setSyncState(...) })` — error message gets shown in `state.inventory.message` but no stack is logged.
- **Why classify this way**: when this fires, you have no idea where the failure happened.
- **Recommended change**: also `console.error(error)` so the stack is in the logs.
- **Risk**: none.

### IMPROVE — `server/routes/sync.js:281-284` — `catch (error) { console.log(...); throw error; }`
- **Current behaviour**: re-throws the same error after a `console.log`.
- **Why classify this way**: per the rules, this is a "rethrow with no added context" — could just be a `try { ... } finally {}` if we want logging, or removed. Adding context (e.g. `throw new SyncError('inventory sync failed', { cause: error })`) would be valuable.
- **Recommended change**: either remove (the outer `.catch` at `:198` already logs), or wrap in a typed error.
- **Risk**: none.

### IMPROVE — `server/routes/import.js:247-249` — per-row Discogs error is swallowed with `console.log` but never surfaced
- **Current behaviour**: `} catch (error) { console.log('[import-sync] error:', change.releaseId, error.message); }` then continues — a partially-failed import leaves no record.
- **Why classify this way**: user sees "100/100 synchronized" even if 30 failed.
- **Recommended change**: collect failed change IDs and report a count in the final `setImportSyncState({ status: 'completed', message: ... })`.
- **Risk**: low — improves user-visible accuracy.

### IMPROVE — `server/routes/import.js:385-395` — `try { discogs = getDiscogsClientForUser(req); } catch { setImportSyncState(... 'No se pudo conectar...') }`
- **Current behaviour**: catches the synchronous "Discogs account is not configured" error and shows a Spanish-only message.
- **Why classify this way**: the message is hardcoded Spanish (cross-references the i18n issue in MEMORY.md). Also the catch block is empty `catch {}` form which discards the actual error.
- **Recommended change**: catch the typed error, log the cause, and use `req.t(...)` for the message.
- **Risk**: none.

### REMOVE / IMPROVE — `server/services/exchangeRates.js:60-61` — double `.catch(() => null)` on ECB rate calls
- **Current behaviour**: `await ecb.getRate(currency, today).catch(() => null)` falls back to yesterday on any error, then the outer block at `:82-87` falls back to a stale `cachedSnapshot` if available, otherwise re-throws.
- **Why classify this way**: the today→yesterday fallback is reasonable (ECB hasn't published today's rate yet), but `.catch(() => null)` swallows ALL errors including auth/network — they're indistinguishable from "no rate published". A persistent network failure will flip silently to yesterday's rate forever.
- **Recommended change**: distinguish "404/no rate" (expected, fall back) from "5xx/network" (log and report). At minimum log the swallowed error.
- **Risk**: low.

### REMOVE — `?? 0` defaults that mask missing data
- **Location**: `server/routes/sync.js:394`, `server/routes/collection.js:147` (`stats?.lowest_price?.value ?? 0`).
- **Current behaviour**: missing marketplace value becomes `0` and is written to the DB.
- **Why classify this way**: same root cause as the `.catch(() => null)` finding above — `0` is indistinguishable from "we don't know yet" in dashboards/exports.
- **Recommended change**: use `null` (the column allows NULL) so dashboards and totals can correctly skip.
- **Risk**: small — `formatCurrency(null)` paths must already exist (`Dashboard.jsx:259` uses `?:` ternary on truthiness, but `0` is falsy so this is already partly broken).

### KEEP — Global Express error middleware (`server/index.js:89-91`)
- **Current behaviour**: `(err, req, res, next) => res.status(500).json({ error: err.message || req.t('backend.server.internal') })`.
- **Why classify this way**: this is the right place to translate errors to HTTP responses.
- **Recommended change**: extend it to inspect `err.status` / `err.cause` and pick a status code accordingly. Once per-route try/catch wrappers are removed, this middleware will absorb most failures.
- **Risk**: positive — tightens the error contract.

## Patterns Observed

1. **Every Express route handler is wrapped in the same `try/catch → res.status(500)`** (~17 occurrences). A global error middleware already exists, making these redundant. This is the single biggest cleanup opportunity.
2. **Every async UI action follows the same `setLoading(true) / try / catch / toast / finally setLoading(false)`** ceremony (~15 occurrences). These are legitimate boundaries but ripe for extraction into a `useAsyncAction` hook.
3. **Three `api.getAccount().catch(() => DEFAULT_FALLBACK)`** in `AuthContext.jsx` mask backend failures and force EUR currency — directly conflicts with the "currency hardcoded to EUR" memory note.
4. **`.catch(() => null)` + `?? 0`** on Discogs marketplace stats writes a misleading `0` into the database, corrupting dashboard totals on transient errors.
5. **Empty `catch {}` polling loops** in `SyncButton`, `ImportButton`, `Collection.jsx` will retry forever with no telemetry; need a max-attempt cap and a user-visible error.
6. **Hardcoded Spanish in catch fallbacks** (`'Error de red'`, `'No se pudo conectar con Discogs...'`) breaks i18n for error states — relevant to the project's known i18n gap.
7. **No `process.on('uncaughtException')` or `unhandledRejection` handlers** — good (nothing to recommend removing).
8. **No `@ts-ignore` / `@ts-expect-error`** — codebase is JavaScript, not TypeScript, so type-suppression patterns don't apply.
