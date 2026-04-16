# AI Slop & Comments Findings

## Summary

- Slop / low-value comments: 13
- Stub functions: 0
- `console.log` statements (left as ad-hoc logging): 10 (all in server code)
- Scaffold / sample leftovers: 0
- Motion comments ("Updated/Refactored/Previously/Now"): 0
- File-top author/date banners: 0
- Inflated JSDoc: 0 (one short, justified JSDoc on `parseRetryAfter`)
- Section divider banners: 4 occurrences (in 2 files)

Overall the codebase is unusually clean of AI slop. Findings concentrate in two areas: (1) server-side `console.log` calls used as informal logging, which should either move to a proper logger or use `console.error`/`console.warn`, and (2) low-value section divider banners and a few comments that restate the next line.

## Findings (ranked by clarity gain)

### REPLACE Console-as-logger statements should use `console.error` / `console.warn`
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:159, 199, 282, 411, 442, 516`; `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:255`; `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:248`; `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/middleware/rateLimit.js:22`
- **Current text**: `console.log('[sync] inventory sync failed:', error.message);` (and similar)
- **Action**: Replace `console.log` with `console.error` in error branches and `console.warn` for the rate-limit pause notice. Long-term, route through a single logger module.
- **Reasoning**: These all log error/warn conditions but use `console.log`, so they get lost in stdout and fail to signal severity. Mixed Spanish/English log prefixes (`[sync] no se pudo obtener…`, `cuota llena, esperando…`) also point at quick-iteration debug code that survived. Not strictly "slop", but leftover ad-hoc logging that should be normalised.

### DELETE Section divider banners in `import.js` and `media.js`
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:20-22, 189-191, 266-268`; `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:135-138`
- **Current text**:
  ```
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  ```
- **Action**: Delete the three dashed banners in `import.js` (`Helpers`, `Background sync with Discogs`, `Routes`) and the equivalent in `media.js` (`Server-side gapless poster composition ("Tapete")`). Keep the one-line description from the `media.js` block as a single comment above `computeOptimalTileSize`: `// Server-side gapless poster: stitches all covers via sharp.composite()`.
- **Reasoning**: ASCII dividers are noise — these files are short enough to navigate by symbol. The Tapete description is worth one line, not three.

### DELETE `// --- Routes ---` divider in sync.js
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:451`
- **Current text**: `// --- Routes ---`
- **Action**: Delete.
- **Reasoning**: Same noise category. The `router.post('/'…)` line below makes the section obvious.

### DELETE `// --- Rating ---` and `// --- Notes (custom fields) ---` dividers
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:301, 307`
- **Current text**: `// --- Rating ---` / `// --- Notes (custom fields) ---`
- **Action**: Delete both.
- **Reasoning**: The variable names `nextRating` / `currentNotes` make the section purpose self-evident. The block at line 314-316 explaining the field_id 3 fallback is the comment that actually carries information; keep it.

### DELETE Restates-the-next-line comments
- **Location**:
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:225` — `// Fetch all pages of the user's inventory` above `getInventory(1, 100)`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:273` — `// Update releases that match` above the obvious update statement
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:207` — `// Ensure thumbnails exist at the chosen variant`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:218` — `// Build composite input array for sharp`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:237` — `// Create base canvas and composite all tiles`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:354` — `// Apply to local DB immediately`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/ColumnToggle.jsx:23` — `// Position once after render`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/ImportButton.jsx:22` — `// Poll import sync status`
  - `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/SyncButton.jsx:113` — `// If we mount while enrichment is running, start polling`
- **Action**: Delete all.
- **Reasoning**: Each restates what the next 1-3 lines clearly do. New readers learn nothing; experienced readers skim past.

### DELETE `// continue` placeholder comment
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:82`
- **Current text**: `// continue` (inside an empty `catch {}`)
- **Action**: Delete the comment; the empty catch already says "swallow and continue".
- **Reasoning**: A bare `} catch {` already conveys "ignore the error". The word "continue" reads like a placeholder note from the author.

### REPLACE Idle/preview/loading state divider comments in JSX
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/ImportButton.jsx:97, 126, 133, 231, 238, 256, 268`
- **Current text**: `{/* ── Idle: buttons + explanation ── */}`, `{/* ── Loading ── */}`, `{/* ── Preview ── */}`, etc.
- **Action**: Delete. The conditional `{phase === 'idle' && (…)}` immediately below already names the state.
- **Reasoning**: Decorative `──` characters and labels duplicate the state name in `phase ===` checks. If a glance-aid is wanted, the existing phase enum on line 14 already documents the state machine.

### KEEP-WITH-EDIT Phase enum comment
- **Location**: `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/components/ImportButton.jsx:14`
- **Current text**: `// idle | loading | preview | applying | syncing | done | error`
- **Action**: Keep, but move directly above the `useState('idle')` call (it's already there) — this is the only state-machine documentation in the file and worth keeping.
- **Reasoning**: Lists allowed values for a string state — this kind of comment IS valuable.

### KEEP — comments worth retaining (do NOT touch)

These are explicitly worth keeping; calling them out so a future cleanup pass doesn't strip them:

- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/middleware/rateLimit.js:1-2` — explains the `SAFE_RPM = 55` choice (Discogs allows 60); load-bearing.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/middleware/rateLimit.js:21` — `// +200ms safety margin` justifies the magic number.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/middleware/rateLimit.js:36-39` — JSDoc on `parseRetryAfter`; short and explains the fallback behaviour.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/discogs.js:79-80, 92-93, 105-106, 111, 118` — link to the relevant Discogs API docs and clarify the unusual POST/PUT semantics; valuable spec references.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/discogs.js:53` — `// Some endpoints return empty 200`; explains a non-obvious branch.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:222` — explains *why* the table is cleared (delisted items invariant).
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:241, 264` — explains the priority logic (For Sale > Draft, lower price wins).
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/sync.js:333` — `// continue warming remaining covers`; explains the intentional swallow of one cover failure.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:132-133` — explains the `tracklist === '[]'` heuristic for "never enriched".
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/collection.js:314-316` — explains the field_id 3 fallback for Discogs notes.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:189-191` — explains the variant-selection heuristic to avoid upscaling.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/media.js:192, 194, 196` — inline `// 220px`, `// 720px`, `// 320px`; useful pixel-size annotations next to opaque variant names.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/account.js:66-67` — explains the maintenance contract for the preference whitelist.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/routes/import.js:121` — `// 1-indexed + header row` clarifies the `+ 2` offset.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/server/db.js:219` — `// First user is always admin`; explains the bootstrap rule.
- `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf/src/pages/Collection.jsx:160` — explains the side-effect (sort reset) when hiding the active sort column.

### Notes on what we did NOT find

- No `TODO`, `FIXME`, `XXX`, `HACK` markers anywhere in `js/jsx`.
- No `throw new Error('Not implemented'…)` or stub returns.
- No "Updated/Refactored/Previously/Now using/Replaced" motion comments.
- No file-top author/date banners.
- No scaffold or starter-template leftovers (no unused example components).
- `src/lib/`, `shared/`, and `src/hooks/` have no comments at all — code reads cleanly without them.
