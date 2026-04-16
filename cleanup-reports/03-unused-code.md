# Unused Code Findings

## Tools run
- knip: `npx -y knip --reporter json` and `npx -y knip` (no `knip.json` needed; auto-detected entry points from `package.json` scripts: `vite` build for `src/`, `node server/index.js` for `server/`, `vitest` for `tests/`). Reported 4 unused files and 7 unused exports.
- ts-prune: `npx -y ts-prune` failed with `ENOENT tsconfig.json` — this is a pure JavaScript project (ESM via `"type": "module"`), no TypeScript config, so ts-prune is not applicable. Cross-check skipped.
- Manual `Grep` verification was performed for every reported symbol across the entire worktree (including `tests/`, `shared/`, `server/`, `src/`).

## Summary
- Unused files: **4**
- Unused exports: **7** (1 file-level dead export, 1 export-keyword that could be made local, 5 i18n module-level exports flagged POSSIBLY-PUBLIC)
- Unused dependencies: **0** (all 14 prod deps + 6 dev deps verified used)
- Unused enum members / type members: **0** (no TypeScript)

## Findings (ranked by safety to remove)

### [SAFE-TO-DELETE] `src/components/charts/CountryChart.jsx`
- **Path**: `src/components/charts/CountryChart.jsx:1-22`
- **Type**: file (entire React component)
- **Verification**: `Grep "CountryChart"` returns only 2 hits — both inside the file itself (function decl + default export). All 6 sibling charts (`DecadeChart`, `FormatChart`, `GenreChart`, `GrowthChart`, `LabelChart`, `StylesChart`) are imported by `src/pages/Dashboard.jsx`; CountryChart is not.
- **Notes**: `recharts` dependency stays — the other 6 charts use it.

### [SAFE-TO-DELETE] `src/components/CompletionRing.jsx`
- **Path**: `src/components/CompletionRing.jsx:1-41`
- **Type**: file (entire React component)
- **Verification**: `Grep "CompletionRing"` returns only 2 hits inside the file itself. No importers anywhere.
- **Notes**: None — purely orphaned component.

### [SAFE-TO-DELETE] `src/components/StatSparkline.jsx`
- **Path**: `src/components/StatSparkline.jsx:1-65`
- **Type**: file (entire React component)
- **Verification**: `Grep "StatSparkline"` returns only 2 hits inside the file itself. No importers anywhere.
- **Notes**: None — purely orphaned component.

### [SAFE-TO-DELETE] `src/hooks/useAnimatedNumber.js`
- **Path**: `src/hooks/useAnimatedNumber.js:1-end`
- **Type**: file (custom React hook)
- **Verification**: `Grep "useAnimatedNumber"` returns only 1 hit (the `export function` line in this file). The hook itself imports `useReducedMotion`, but that hook is also used by `Dashboard.jsx` and `ConfettiBurst.jsx`, so deleting this file does NOT make `useReducedMotion` orphan.
- **Notes**: Safe to delete the file alone; do not also delete `useReducedMotion`.

### [SAFE-TO-DELETE] `getUserByUsername` export in `server/db.js`
- **Path**: `server/db.js:312`
- **Type**: export (named function)
- **Verification**: `Grep "getUserByUsername"` returns 1 hit only — the declaration itself. Zero callers in `src/`, `server/`, `shared/`, `tests/`, `scripts/`. Auth flow uses `getUserById` plus a direct `db.prepare` query elsewhere.
- **Notes**: None — fully dead.

### [SAFE-TO-DELETE] `SUPPORTED_CURRENCIES` re-export in `server/services/exchangeRates.js`
- **Path**: `server/services/exchangeRates.js:144` (the `SUPPORTED_CURRENCIES` portion of `export { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, normalizeCurrency };`)
- **Type**: export (re-export only — original lives in `shared/currency.js`)
- **Verification**: `Grep "SUPPORTED_CURRENCIES"` shows 4 importing locations: `shared/currency.js` (origin), `server/services/exchangeRates.js` (re-export + internal usage at line 37), `src/pages/Collection.jsx:16` (imports from `shared/currency`, NOT from exchangeRates), and the export line itself. No external consumer imports `SUPPORTED_CURRENCIES` from `exchangeRates.js`. The `DEFAULT_CURRENCY` and `normalizeCurrency` siblings in the same re-export ARE used externally and must stay.
- **Notes**: Drop only `SUPPORTED_CURRENCIES` from the re-export list at line 144; keep `DEFAULT_CURRENCY` and `normalizeCurrency`.

### [NEEDS-REVIEW] `requireDiscogsAccount` `export` keyword in `server/middleware/auth.js`
- **Path**: `server/middleware/auth.js:33`
- **Type**: export modifier (function is used internally)
- **Verification**: `Grep "requireDiscogsAccount"` returns 2 hits: the declaration and a local call at `server/middleware/auth.js:42` inside `getDiscogsClientForUser`. No external module imports it.
- **Notes**: The function itself is needed (used locally). Just drop the `export` keyword. Low-risk but it does narrow the public API of the middleware module — confirm intent.

### [POSSIBLY-PUBLIC] `interpolate` in `shared/i18n.js`
- **Path**: `shared/i18n.js:795`
- **Type**: export (utility function)
- **Verification**: `Grep "\binterpolate\b"` against `src/`, `server/`, `tests/` returns no external hits. Only used internally by `translate()` at `shared/i18n.js:802`. Other matches in `package-lock.json` refer to unrelated `d3-interpolate`.
- **Notes**: `shared/` is a cross-cutting module also consumed by frontend (`src/lib/api.js`, components) and backend (`server/index.js` middleware via `req.t`). Looks like a small i18n helper API; safe to inline into `translate()` but flag for maintainer review since `interpolate` is a generic-named utility a future caller might reach for.

### [POSSIBLY-PUBLIC] `LOCALE_STORAGE_KEY` in `shared/i18n.js`
- **Path**: `shared/i18n.js:1`
- **Type**: export (constant)
- **Verification**: `Grep "LOCALE_STORAGE_KEY"` returns hits in `shared/i18n.js` (declaration + 2 internal uses) and `src/lib/api.js:2` — but `src/lib/api.js` defines its OWN identically-named constant `'discographic-locale'` rather than importing the shared one. So the `shared/i18n.js` export has zero importers.
- **Notes**: Two definitions of the same string is a latent duplication bug. The cleaner fix is to make `src/lib/api.js` import from `shared/i18n.js` (then the export is used) rather than delete the export. Flagged as needing maintainer judgment.

### [POSSIBLY-PUBLIC] `DEFAULT_LOCALE` in `shared/i18n.js`
- **Path**: `shared/i18n.js:2`
- **Type**: export (constant)
- **Verification**: `Grep "DEFAULT_LOCALE"` returns 5 hits — all inside `shared/i18n.js` (declaration + 4 internal references). No external importer.
- **Notes**: Public-looking constant in a shared module. Could be made non-exported, but might be intentionally exposed for future consumers (e.g. Settings UI default selection).

### [POSSIBLY-PUBLIC] `SUPPORTED_LOCALES` in `shared/i18n.js`
- **Path**: `shared/i18n.js:3`
- **Type**: export (constant)
- **Verification**: `Grep "SUPPORTED_LOCALES"` returns 2 hits — declaration and 1 internal use at line 775. No external importer.
- **Notes**: Same situation as `DEFAULT_LOCALE`. Shared-module constants representing the locale contract; a Settings/locale-switcher UI is a likely future caller. Recommend keeping unless the maintainer confirms no plans to expose a locale picker that reads this list.

## Notes on dependency check
All 14 production dependencies and 6 devDependencies in `package.json` were `Grep`-verified across the source tree:
- `bcryptjs` -> `server/routes/auth.js`, `server/routes/admin.js`
- `better-sqlite3` -> `server/db.js`
- `better-sqlite3-session-store` -> `server/index.js`
- `csv-stringify` -> `server/routes/export.js`
- `ecb-exchange-rates-ts` -> `server/services/exchangeRates.js`
- `express`, `express-session` -> `server/index.js`
- `html-to-image` -> `src/lib/exportImage.js`
- `multer` -> `server/routes/import.js`
- `react`, `react-dom`, `react-router-dom` -> multiple `src/` files
- `recharts` -> `src/components/charts/*`
- `sharp` -> `server/routes/media.js`
- `xlsx` -> `src/components/ExportButton.jsx`, `server/routes/import.js`, `server/routes/export.js`
- devDeps (`@vitejs/plugin-react`, `autoprefixer`, `postcss`, `tailwindcss`, `vite`, `vitest`) all referenced by config files / scripts.

No unused dependencies found.

## Notes on dynamic / string-based imports
- `Grep "import\\s*\\("` -> only one match (`@type {import('tailwindcss').Config}` in `tailwind.config.js`), which is a JSDoc type, not a runtime dynamic import.
- `Grep "require\\s*\\("` -> 0 matches.
- No reflective/route-based file discovery (Express routes are explicitly imported in `server/index.js`; React routes are explicit in `src/App.jsx` / `src/main.jsx`).
- Conclusion: static-import codebase, knip's results are reliable and the manual greps cover the full surface.
