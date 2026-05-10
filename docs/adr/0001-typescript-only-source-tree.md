# TypeScript-only source tree

Discographic will allow no versioned project-owned JavaScript source files. All project-owned application code, tests, and supported tool configuration must be TypeScript (`.ts` or `.tsx`) or non-JavaScript formats such as shell or JSON; generated build output and dependency code are excluded from this rule. Project-owned tool configuration gets no JavaScript exception: if a tool cannot reliably load TypeScript or non-JavaScript configuration, the toolchain must be adjusted rather than keeping `.js`, `.jsx`, `.mjs`, or `.cjs` config files. The completed migration must run with `strict: true`, `allowJs: false`, `skipLibCheck: false`, and a required typecheck gate. Dependencies without bundled or DefinitelyTyped types must use minimal project-owned declarations for only the imported surface area. This is a deliberate full migration, chosen so the shared contracts around **Account state**, **Release shape**, **Discogs sync run**, **Import workflow**, and **Database schema lifecycle** can become enforceable boundaries before the next product slices.

The no-JavaScript guard applies to versioned project-owned files, not to dependency code or generated output. Build artifacts such as `dist/` may contain JavaScript generated from TypeScript, but they must not be treated as maintained source and should remain untracked unless explicitly needed as release artifacts.

External and stored data from Discogs, CSV/XLSX imports, SQLite JSON fields, and HTTP responses must enter the typed app as untrusted data and become domain types through explicit normalizers. The migration should not introduce a runtime schema library unless a specific boundary proves that the existing normalization pattern is insufficient.

Type contracts should live next to the normalization or domain logic that produces them. A central shared types area is reserved only for small primitives that are genuinely cross-cutting, avoiding a disconnected type dumping ground.

The migration is behavior-preserving. It must not change user workflows, API semantics, database schema semantics, or UI behavior except where a small extraction is required to type existing behavior honestly. Domain ambiguities discovered by TypeScript should be documented and split into follow-up work unless they block the migration.

Express request augmentation is an explicit infrastructure contract. Middleware-populated fields such as locale, translation helper, authenticated user, and Discogs client must be declared in project-owned TypeScript declarations rather than passed through untyped request objects.

`strict: true` prevents implicit `any`. Explicit `any` is allowed only for narrow interop cases that cannot be represented honestly during the migration, and each use must explain why it is safe or temporary. External boundaries should prefer `unknown` plus normalization.

Development and tests may execute TypeScript directly through tooling such as `tsx` and Vitest. Production must run compiled backend output produced from TypeScript sources, so self-hosted deployments do not depend on a TypeScript runtime loader.

TypeScript source may use `.js` import specifiers where Node ESM compiled output requires them. This is not an exception to the source-file rule: project-owned JavaScript files remain prohibited, but runtime specifiers must stay compatible with compiled JavaScript output.

Existing self-hosted installations must be able to update from the last JavaScript release to the TypeScript implementation without losing local data, Discogs configuration, preferences, cached covers, or database migration continuity. The Docker and Node start paths should remain operationally equivalent from the user's perspective, and the migration plan should include an upgrade smoke test over persisted data.

The repository must include explicit contribution guidance for humans and LLM agents, plus automated guards. `CONTRIBUTING.md` should orient human contributors, and `AGENTS.md` should give coding agents the same critical rules in a shorter operational form. The guidance should state that new project-owned source, tests, scripts, and supported configuration are TypeScript-only; automated verification must still enforce the rule with a source-file scan, typecheck, test run, and build.
