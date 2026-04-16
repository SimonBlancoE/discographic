# Circular Dependency Findings

## Tool output

| Scope | Command | Files processed | Cycles |
|---|---|---:|---:|
| `src/` (frontend) | `npx -y madge --circular --extensions ts,tsx,js,jsx src` | 45 | **0** |
| `server/` (backend) | `npx -y madge --circular --extensions ts,tsx,js,jsx server` | 18 | **0** |
| `shared/` | `npx -y madge --circular --extensions ts,tsx,js,jsx shared` | 2 | **0** |
| Whole repo | `npx -y madge --circular --extensions ts,tsx,js,jsx --warning .` | 73 | **0** |
| Combined source roots | `npx -y madge --circular --extensions ts,tsx,js,jsx --warning src server shared scripts tests` | 70 | **0** |

The only diagnostic noise is one skipped file: `csv-stringify/sync` (a re-exported subpath inside `node_modules` that madge can't statically resolve — irrelevant to source-level cycles).

## Result

**No circular dependencies were found in any source root or in the whole repo.** The dependency graph forms a clean DAG.

The shape of the graph is exactly what you'd hope for in a small Vite + Express app:

- **Leaves with 0 dependencies** (well-isolated utilities / pure components):
  `server/db.js`, `server/middleware/rateLimit.js`, `server/services/enrichmentQueue.js`,
  `shared/currency.js`, `shared/i18n.js`, `src/lib/achievements.js`, `src/lib/api.js`,
  `src/lib/columns.js`, `src/lib/exportImage.js`, `src/lib/format.js`,
  `src/components/CompletionRing.jsx`, `src/components/LoadingSkeletons.jsx`,
  `src/components/StatSparkline.jsx`, `src/components/charts/ChartTooltip.jsx`,
  `src/hooks/useReducedMotion.js`.
- **High-fan-in entry points** (page composers that import many leaves — expected and healthy):
  `src/pages/Dashboard.jsx` (18), `src/pages/Collection.jsx` (14),
  `server/index.js` (12), `src/App.jsx` (9), `src/pages/ReleaseDetail.jsx` (8),
  `server/routes/sync.js` (6), `src/components/CoverWall.jsx` (6).

## Findings (one per cycle)

_None._

## Near-misses / fragility notes

Even though there are no cycles, a few coupling patterns are worth keeping an eye on so they stay clean as the app grows. None of these need action today.

### Near-miss 1: `src/lib/AuthContext.jsx` is the gravity well of context

- **Files involved**: `AuthContext.jsx` is imported by both `App.jsx` and most pages, while itself living next to `I18nContext.jsx`, `ToastContext.jsx`. Today none of these context modules import each other, which is what keeps the graph acyclic.
- **Risk**: if `AuthContext` ever needed to read i18n strings or surface a toast (e.g. "session expired"), an import from `AuthContext` → `I18nContext`/`ToastContext` would still be safe — but the moment one of those contexts grows a hook that wants to know "am I logged in?" you'd close a cycle.
- **Preventive fix**: keep cross-context coordination in **page-level** code (the place that already imports all three providers via `App.jsx`), or push shared primitives down into a leaf module like `src/lib/sessionEvents.js` (an EventTarget) that all three contexts can subscribe to.
- **Effort**: LOW (only relevant if/when this is added).
- **Risk to existing behaviour**: none today.

### Near-miss 2: `src/lib/api.js` is a 0-dep leaf — keep it that way

- **Files involved**: `src/lib/api.js` is a pure HTTP wrapper with zero local imports. Lots of components depend on it.
- **Risk**: it's tempting to import `AuthContext` here so requests can read the token, which would invert the dependency direction (currently `AuthContext` → `api`, presumably). That would create a cycle the moment anything in `api.js`'s call chain re-imports `AuthContext`.
- **Preventive fix**: pass the token in as an argument from the caller (current pattern) or expose a `setAuthToken(token)` setter on the api module that `AuthContext` calls in a `useEffect`. Never import the React context module from inside `api.js`.
- **Effort**: LOW.
- **Risk**: none today.

### Near-miss 3: `shared/` is correctly leaf-only

- **Files involved**: `shared/currency.js` and `shared/i18n.js` are imported by both `src/` and `server/` and import nothing themselves. This is exactly right.
- **Preventive rule**: anything added to `shared/` must remain dependency-free of `src/` or `server/` — otherwise you'd risk a cross-tier cycle that bundlers (Vite vs Node) would each blame on the other. Worth codifying as a lint rule (e.g. an `eslint-plugin-import` `no-restricted-paths` zone forbidding `shared/**` from importing `src/**` or `server/**`).
- **Effort**: LOW (one config block).
- **Risk**: none — purely defensive.

## Conclusion

The codebase is in excellent shape on this dimension: the import graph is a true DAG across frontend, backend and shared code. No untangling work is required. Treat the three "near-miss" notes above as lightweight guardrails for future changes rather than as defects.
