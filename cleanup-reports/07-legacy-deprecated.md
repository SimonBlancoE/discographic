# Deprecated / Legacy Code Findings

## Scope and method
- Read-only review of branch `chore/code-review-and-perf` (worktree at `/home/octo/Projects/discographic-public/.worktrees/code-review-and-perf`).
- `node_modules` and `package-lock.json` excluded from every search.
- Tools: `Grep` for `@deprecated`, case-insensitive `legacy|deprecated|fixme|hack|xxx|temporary|transitional|backwards?[ -]?compat|obsolete|todo`, multiline scan for commented-out code blocks, plus targeted call-graph greps to verify whether each candidate is actually unreferenced.
- Cross-check: the existing `cleanup-reports/03-unused-code.md` already covers fully orphan files/exports (`CountryChart.jsx`, `CompletionRing.jsx`, `StatSparkline.jsx`, `useAnimatedNumber.js`, `getUserByUsername`, `SUPPORTED_CURRENCIES` re-export, `requireDiscogsAccount` modifier, four `shared/i18n.js` POSSIBLY-PUBLIC exports). Findings below focus on **legacy / migration / duplicate-version** code that report 03 does not flag, and only repeats the small overlap (`getUserByUsername`) for the sake of category counts.

## Summary
- `@deprecated` JSDoc / TSDoc tags: **0** (only hit in `package-lock.json` for an upstream package, irrelevant)
- `// TODO`, `FIXME`, `HACK`, `XXX`, `LEGACY`, `DEPRECATED` comment markers in source: **0** (zero matches in `src/`, `server/`, `shared/`, `tests/`, `scripts/`)
- Commented-out code blocks (3+ consecutive `//` lines that look like code): **0** (every grep hit was prose documentation, not commented-out logic)
- `legacy` identifiers in source code: **5** (all in `server/db.js` — variables `hasLegacyRows` x3 and the exported function `migrateLegacyDataToUser` + its single caller in `server/routes/auth.js`)
- Migration / shim functions in `server/db.js`: **6** (`migrateReleases`, `migrateSyncLog`, `migrateSettings`, `migrateUsersRole`, `migrateListingColumns`, `migrateLegacyDataToUser`)
- Duplicate-name versions: **1** (`getUserByUsername` vs `getUserAuthByUsername` in `server/db.js`)
- Dead branches / fallback branches firing only for impossible states: **3** (in `migrateReleases`)
- Obsolete polyfills: **0** (no Babel/browserslist/tsconfig `target`; Node engine `>=18`; runtime images are Node 22; no polyfill packages in deps)
- Env-flag–gated dead branches: **0** (only env vars are `PORT`, `COOKIE_SECURE`, `SESSION_SECRET`, `VITE_API_PORT`; none gate dead code)
- Backwards-compat aliases (`export const oldName = newName`): **0**
- Engines/runtime drift (worth flagging): **1** (`package.json engines: ">=18"` vs Dockerfile `node:22-alpine` — not legacy code, but the `>=18` declaration is stale relative to the only supported runtime)

## Findings (ranked by safety to remove)

### [SAFE-TO-DELETE] Duplicate `getUserByUsername` export
- **Location**: `server/db.js:312-314`
- **Type**: duplicate version
- **Current state**: Identical body to `getUserAuthByUsername` (line 341-343) — both run `SELECT * FROM users WHERE username = ?`. `Grep "getUserByUsername"` returns exactly one hit (the declaration). Zero importers in `src/`, `server/`, `shared/`, `tests/`, `scripts/`. The auth flow uses `getUserAuthByUsername` (`server/routes/auth.js:54`).
- **Recommended action**: Delete the function entirely. Already flagged in `cleanup-reports/03-unused-code.md` — repeated here because it is the canonical example of a legacy duplicate sitting next to the surviving version.
- **Risk**: None — no callers, no observable behaviour change.

### [SAFE-TO-DELETE] Dead "table `releases_v2` was not created" branch
- **Location**: `server/db.js:106-112` inside `migrateReleases()`
  ```js
  const v2Columns = getColumns('releases_v2');
  if (tableExists('releases') && !v2Columns.length) {
    throw new Error('Table releases_v2 was not created');
  }
  ```
- **Type**: dead branch (impossible state)
- **Current state**: `createBaseTables()` is called immediately before `migrateReleases()` on every startup (line 241-242) and unconditionally executes `CREATE TABLE IF NOT EXISTS releases_v2 (...)`. The only way `v2Columns.length === 0` here is if SQLite silently failed to create the table — at which point the next `db.exec` would throw anyway. The guard is a leftover from an earlier version where table creation was optional/conditional.
- **Recommended action**: Delete the three lines.
- **Risk**: None — the surrounding `db.exec` calls would throw a more accurate error if the table really were missing.

### [SAFE-TO-DELETE] Schema double-rename branch (`releases` already exists with `release_id`)
- **Location**: `server/db.js:114-119`
  ```js
  if (tableExists('releases') && releaseColumns.some((column) => column.name === 'release_id')) {
    db.exec('DROP TABLE IF EXISTS releases_v2');
    db.exec('ALTER TABLE releases RENAME TO releases_v2_current');
    db.exec('ALTER TABLE releases_v2_current RENAME TO releases');
    return;
  }
  ```
- **Type**: dead branch / no-op transitional
- **Current state**: When `releases` exists and already has the `release_id` column (i.e. a normal post-migration database), this branch drops the freshly-created `releases_v2`, then renames `releases` to `releases_v2_current` and immediately back to `releases`. The two ALTERs produce no net schema change. The only useful effect is dropping the unused `releases_v2` scaffolding table created seconds earlier by `createBaseTables()`.
- **Recommended action**: Replace the entire branch (and the symmetric `releases_v2 RENAME TO releases` paths) with a single guarded `DROP TABLE IF EXISTS releases_v2` after a clean schema is in place — or, better, stop creating `*_v2` tables in `createBaseTables()` for users on the current schema.
- **Risk**: Low. Existing post-migration databases would lose only a temporary scaffold table they never use. New installs are unaffected. Worth one full pass through the migration test in `tests/inventory-sync.test.js` and a one-time install-from-empty smoke run to confirm.

### [NEEDS-REVIEW] Entire schema-migration shim layer (`*_v2` tables + three `migrate*` functions)
- **Location**: `server/db.js:36-199`
  - `createBaseTables()` lines 56, 86, 96 create `releases_v2`, `sync_log_v2`, `settings_v2` only to rename them to their final names a few statements later.
  - `migrateReleases()` 106-161, `migrateSyncLog()` 163-180, `migrateSettings()` 182-199 — all three switch on whether legacy unsuffixed tables already exist, copy rows from old to `_v2`, drop the old table, and rename `_v2` to the final name.
- **Type**: migration shim / transitional
- **Current state**: This was the multi-user schema upgrade. Repo is at v0.1.0 (first tagged release per `CHANGELOG.md`). For any user who installed at v0.1.0 or later, the legacy unsuffixed tables (without `user_id`) never exist, so:
  - `migrateReleases()` falls through to `if (!tableExists('releases')) { ALTER releases_v2 RENAME TO releases; return; }` on first boot, then on every subsequent boot enters the dead double-rename branch above.
  - `migrateSyncLog()` and `migrateSettings()` similarly only do useful work if a pre-multi-user database is found.
- **Recommended action**: Two-step.
  1. Inline the final schema directly into `createBaseTables()` (rename `releases_v2` -> `releases`, etc., remove the `_v2` suffix from the `CREATE TABLE` statements).
  2. Delete `migrateReleases`, `migrateSyncLog`, `migrateSettings`, and `migrateLegacyDataToUser` (see next entry) plus their call sites at lines 242-244 and the `migrateLegacyDataToUser` import + call in `server/routes/auth.js:3,39`.
- **Risk**: Breaking change for any operator still on a pre-v0.1.0 dev database. Since the project shipped v0.1.0 as its public release and this was the first tagged version, the realistic upgrade audience is the maintainer's own dev machine. Worth a one-line CHANGELOG note ("dev databases from before v0.1.0 require a one-time export+reimport") and the cleanup is then safe.

### [NEEDS-REVIEW] `migrateLegacyDataToUser` — only useful during the very first bootstrap
- **Location**: `server/db.js:387-391` (declaration), `server/routes/auth.js:3,39` (only caller)
- **Type**: transitional
- **Current state**: Called from `POST /api/auth/bootstrap`, runs three `UPDATE … SET user_id = ? WHERE user_id IS NULL` statements. Rows with `user_id IS NULL` only exist if the database was migrated from the pre-multi-user schema and never had a user attached (i.e. a single-user install upgraded to multi-user, then bootstrapped). For any fresh v0.1.0+ install the three UPDATEs touch zero rows.
- **Recommended action**: Delete together with the migration shim above. Auth bootstrap then becomes "create user and start session" with no data attribution side effect.
- **Risk**: Same audience as above — an operator who installed pre-v0.1.0, never bootstrapped, then upgrades. Document in CHANGELOG and the cleanup is safe.

### [NEEDS-REVIEW] Unconditional "first user is always admin" coercion
- **Location**: `server/db.js:214-224` (`migrateUsersRole`)
- **Type**: legacy column-add migration (still has a useful side effect, but the side effect is silently overriding an admin's later role change)
- **Current state**: The `ALTER TABLE users ADD COLUMN role` block is dead for any database created at or after the schema in `createBaseTables()` (which already declares `role TEXT NOT NULL DEFAULT 'user'`). The lower half — `UPDATE users SET role = 'admin' WHERE id = (lowest user id)` — runs on every boot, which means demoting the first-registered user via the admin UI silently undoes itself on the next restart.
- **Recommended action**: Drop the `ALTER TABLE` block entirely. Move the "first registered user becomes admin" logic into `POST /api/auth/bootstrap` (where it's already implicit — bootstrap calls `createUser(username, hash, 'admin')`) so it runs once at user-creation time, not on every server start.
- **Risk**: Low. Removes the silent role-restore behaviour, which is arguably the bug. Worth confirming with the maintainer whether the restore is intentional (looks accidental — `bootstrap` already passes `'admin'`).

### [NEEDS-REVIEW] `migrateListingColumns` — column-add migration
- **Location**: `server/db.js:226-239`
- **Type**: legacy column-add migration
- **Current state**: All four columns (`listing_status`, `listing_price`, `listing_currency`, `listing_price_eur`) are already in the `releases` table definition (`createBaseTables()` lines 74-77). The `ALTER TABLE` paths only fire on databases created before commit `61c0ff2` ("Add dynamic currency conversion") — i.e. pre-v0.1.0.
- **Recommended action**: Delete after the same v0.1.0 cutoff applies to the rest of the migration shim.
- **Risk**: Identical to the `*_v2` cleanup — only affects pre-release dev databases.

### [SAFE-TO-DELETE] Dead `DiscogsClient.getCustomFields()` method
- **Location**: `server/discogs.js:118-121`
- **Type**: dead method (no callers)
- **Current state**: `Grep "getCustomFields"` returns exactly one hit — the declaration itself. No route, service, or test invokes it. Sibling methods all have call sites; this one stands out.
- **Recommended action**: Delete the method.
- **Risk**: None for current code paths. If a future "manage Discogs custom fields" UI is planned, leave with a one-line `// reserved for future custom-field UI` comment instead.

### [NEEDS-REVIEW] Duplicate `LOCALE_STORAGE_KEY` literal in `src/lib/api.js`
- **Location**: `src/lib/api.js:2` (`const LOCALE_STORAGE_KEY = 'discographic-locale';`) duplicating `shared/i18n.js:1` (`export const LOCALE_STORAGE_KEY = 'discographic-locale';`)
- **Type**: backwards-compat / inlining duplication
- **Current state**: Two definitions of the same magic string. `src/lib/api.js` re-declares it locally instead of importing the exported constant. Report 03 already flags the export side as POSSIBLY-PUBLIC.
- **Recommended action**: Replace the local constant in `src/lib/api.js` with `import { LOCALE_STORAGE_KEY } from '../../shared/i18n.js';`. This both eliminates the duplicate and makes the previously-orphan export legitimately used.
- **Risk**: None — pure refactor.

### [NEEDS-REVIEW] `tests/preferences-api.test.js` re-implements production helpers locally
- **Location**: `tests/preferences-api.test.js:14-25`
- **Type**: legacy test scaffolding / duplicate version
- **Current state**: The test file declares its own `getSettingForUser` / `setSettingForUser` instead of importing from `server/db.js`. This means the test exercises a hand-rolled clone of the SQL — the real exported functions are never executed. If the production SQL drifts (e.g. adds `WHERE user_id IS NOT NULL`), tests still pass.
- **Recommended action**: Either import the real functions from `server/db.js` (preferred — actually exercises shipped code), or rename the test to `Preferences SQL contract` to make the intent ("we test the upsert SQL shape, not the function") explicit.
- **Risk**: Low. If switching to imports, the test must use the same singleton DB initialiser as production or pass a custom `db` instance.

### [NEEDS-REVIEW] `package.json engines: ">=18"` vs runtime Node 22
- **Location**: `package.json:21-23`, `Dockerfile:1,10`
- **Type**: stale declaration
- **Current state**: Engines field promises Node 18+, but the only published runtime is `node:22-alpine`. Any consumer running Node 18 will encounter behaviour the project does not actually exercise.
- **Recommended action**: Bump `engines.node` to `>=22` (matching what is actually tested via the Docker image) or document the supported range explicitly.
- **Risk**: None for the current deployment. Tightens the contract for anyone running outside Docker.

## Notes for the cleanup PR
- The single highest-leverage change is collapsing the migration shim in `server/db.js` (entries "Schema double-rename branch", "Entire schema-migration shim layer", "migrateLegacyDataToUser", "Unconditional first user is always admin", and "migrateListingColumns"). All five live in the same file and are coupled to the same v0.1.0 release-cut decision; doing them as one focused commit keeps the schema history coherent.
- `getUserByUsername` and `DiscogsClient.getCustomFields()` are zero-risk one-line deletions that can ship in any unrelated PR.
- The `LOCALE_STORAGE_KEY` and `tests/preferences-api.test.js` items are quality wins (deduplication, real test coverage) more than legacy removal — bundle them with whichever PR touches `shared/i18n.js` or `server/db.js` next.
