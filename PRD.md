# TypeScript Migration PRD

## Problem Statement

Discographic's next product slices depend on enforceable shared boundaries: **Account state**, **Release shape**, **Discogs sync run**, **Import workflow**, **Marketplace enrichment**, **Sync adapters**, and **Database schema lifecycle**. The current source tree is JavaScript/JSX, which lets backend, frontend, tests, and shared contracts drift without a compiler proving that they still agree.

The user-facing risk is indirect but real: future changes can accidentally break sync status, account capabilities, release representations, marketplace semantics, import results, or self-hosted upgrades. The project also needs clear contribution rules so humans and LLM agents do not reintroduce JavaScript after the migration.

## Solution

Migrate Discographic to a TypeScript-only source tree before the previously planned product issues proceed. All versioned project-owned application code, tests, supported tool configuration, and scripts must become TypeScript (`.ts`/`.tsx`) or non-JavaScript formats such as shell or JSON. Generated JavaScript from build output and dependency JavaScript are allowed, but they are not maintained source.

The migration must preserve behavior and update safety. Existing self-hosted installations must be able to update from the last canonical JavaScript version in Forgejo to the migrated TypeScript version without losing **Local collection** data, Discogs configuration, preferences, cached covers, or **Database schema lifecycle** continuity.

Forgejo is the canonical repository and issue tracker for this work. GitHub remains a downstream publication target only after the migrated version has been tested and verified in Forgejo.

## User Stories

1. As a self-hosting user, I want to update from the last JavaScript version to the TypeScript version, so that I keep my Local collection and configuration.
2. As a self-hosting user, I want Docker updates to keep working, so that `docker compose up -d --build` remains the normal upgrade path.
3. As a self-hosting user, I want my SQLite data to keep migrating through the Database schema lifecycle, so that no manual database intervention is required.
4. As a self-hosting user, I want cached covers to keep working after the migration, so that wall and poster workflows remain usable.
5. As a collector, I want Discogs account configuration to survive the migration, so that I can continue running Discogs sync runs.
6. As a collector, I want preferences such as currency and locale behavior to survive the migration, so that the app behaves the same after upgrade.
7. As a collector, I want Account state to remain accurate after the migration, so that available workflows are not hidden or falsely enabled.
8. As a collector, I want collection views to keep showing the same Release shape, so that collection, detail, wall, random, and export workflows do not regress.
9. As a collector, I want marketplace states to keep their existing meaning, so that pending, priced, unavailable, and failed values are still trustworthy.
10. As a collector, I want import previews and results to keep their behavior, so that CSV/XLSX workflows remain predictable.
11. As a developer, I want all project-owned source files to be TypeScript, so that the compiler can enforce contracts across backend, frontend, shared modules, and tests.
12. As a developer, I want `strict: true`, so that weak or implicit types are caught before product work continues.
13. As a developer, I want `allowJs: false`, so that JavaScript source cannot stay hidden in the migrated codebase.
14. As a developer, I want `skipLibCheck: false` in the final state, so that dependency type conflicts are visible instead of silently ignored.
15. As a developer, I want a required typecheck gate, so that TypeScript correctness is part of normal verification.
16. As a developer, I want a source scan for JavaScript files, so that new `.js`, `.jsx`, `.mjs`, or `.cjs` files fail verification.
17. As a developer, I want a single verification command, so that source scan, typecheck, tests, and build run together before completion.
18. As a developer, I want TypeScript contracts next to their normalizers, so that Release shape, Account state, sync status, and marketplace contracts remain understandable.
19. As a developer, I want external and stored data to enter as untrusted values, so that Discogs, imports, SQLite JSON, and HTTP responses are normalized before becoming domain types.
20. As a developer, I want to avoid broad type assertions on external data, so that TypeScript does not create false confidence.
21. As a developer, I want minimal declarations for dependencies without types, so that unsupported packages are typed only for the surface area Discographic uses.
22. As a developer, I want Express request augmentation declared explicitly, so that locale, translation helper, authenticated user, and Discogs client fields are not passed through untyped request objects.
23. As a developer, I want explicit `any` to be rare and justified, so that the migrated codebase does not replace JavaScript with unchecked TypeScript.
24. As a developer, I want TypeScript source to use Node ESM-compatible import specifiers where needed, so that backend compilation remains simple and reliable.
25. As a developer, I want development and tests to run TypeScript directly when useful, so that migration work remains ergonomic.
26. As a developer, I want production to run compiled backend output, so that self-hosted deployments do not depend on a TypeScript runtime loader.
27. As a developer, I want project-owned tool configuration to avoid JavaScript exceptions, so that the TypeScript-only rule is not undermined by config files.
28. As a maintainer, I want `CONTRIBUTING.md` to describe the TypeScript-only policy, so that human contributors know the rules before opening changes.
29. As a maintainer, I want `AGENTS.md` to give concise operational rules for coding agents, so that LLM contributors do not create JavaScript files or bypass verification.
30. As a maintainer, I want Forgejo identified as the canonical repository, so that issues, PRs, metadata, and contribution guidance point to the correct upstream.
31. As a maintainer, I want GitHub publication excluded from the migration, so that public release happens only after Forgejo verification.
32. As a maintainer, I want the migration split into reviewable vertical slices, so that the full migration can be reviewed without one oversized change.
33. As a maintainer, I want the final cleanup slice to block product issues, so that Account state, Release shape, sync, marketplace, Local collection, and import work start after the compiler guardrails exist.
34. As a maintainer, I want generated JavaScript to remain outside maintained source, so that build artifacts do not confuse contributors or agents.
35. As a tester, I want an upgrade smoke test over persisted data, so that update safety is verified from the user's perspective.
36. As a tester, I want current tests converted to TypeScript, so that existing behavior remains covered through the migration.
37. As a tester, I want tests to focus on observable behavior and contract shape, so that the migration is behavior-preserving rather than implementation-driven.
38. As a coding agent, I want explicit repository rules before editing, so that I know not to create JavaScript, not to use broad casts, and to run verification.
39. As a release operator, I want build and start scripts to remain operationally equivalent, so that deployment habits do not change unnecessarily.
40. As a project owner, I want migration ambiguities documented as follow-up work, so that TypeScript does not silently decide product semantics.

## Implementation Decisions

- The migration creates a TypeScript-only source tree for versioned project-owned files.
- JavaScript files are prohibited for project-owned source, tests, scripts, and supported tool configuration.
- Generated build output and dependency code are excluded from the no-JavaScript source rule.
- Tool configuration gets no JavaScript exception; if a tool cannot reliably load TypeScript or non-JavaScript config, the toolchain must be adjusted.
- The final compiler state requires `strict: true`, `allowJs: false`, `skipLibCheck: false`, and a required typecheck gate.
- Development and tests may execute TypeScript directly through tooling such as `tsx` and Vitest.
- Production must run backend output compiled from TypeScript sources rather than relying on a TypeScript runtime loader.
- TypeScript source may use `.js` import specifiers when Node ESM compiled output requires them.
- `.js` import specifiers are not permission to keep project-owned JavaScript source files.
- External and stored data from Discogs, CSV/XLSX imports, SQLite JSON fields, and HTTP responses must be treated as untrusted until normalized.
- The migration should keep the existing normalization pattern and should not introduce a runtime schema library unless a specific boundary proves that normalizers are insufficient.
- Type contracts should live next to the normalization or domain logic that produces them.
- A central shared types area is reserved only for genuinely cross-cutting primitives and must not become a disconnected type dumping ground.
- Express request augmentation must be declared explicitly for middleware-populated fields such as locale, translation helper, authenticated user, and Discogs client.
- Explicit `any` is allowed only for narrow interop cases that cannot be represented honestly during migration, and each use must explain why it is safe or temporary.
- The migration is behavior-preserving: user workflows, API semantics, database schema semantics, and UI behavior must not change.
- Small extractions are allowed only when needed to type existing behavior honestly.
- Domain ambiguities found during migration should be documented and split into follow-up work unless they block the migration.
- Existing self-hosted installations must update safely from the last canonical JavaScript version in Forgejo.
- The upgrade path must preserve Local collection data, Discogs configuration, preferences, cached covers, and Database schema lifecycle continuity.
- Docker and Node start paths should remain operationally equivalent from the user's perspective.
- `CONTRIBUTING.md` must orient human contributors around the TypeScript-only policy, Forgejo as canonical repo, and required verification.
- `AGENTS.md` must give coding agents short operational rules for TypeScript-only source, untrusted boundaries, and verification.
- Automated verification must include a source-file scan, typecheck, test run, and build.
- Forgejo is the canonical development repository and issue tracker.
- GitHub publication is a later release step after Forgejo verification and is outside the migration scope.
- The migration should be split into reviewable vertical slices: toolchain and guardrails, shared contracts, backend, frontend, tests/config cleanup, and upgrade verification.
- The final cleanup and verification slice should block the existing product issues for Account state, Release shape, Local collection, Marketplace enrichment, Discogs sync run, and Import workflow.

## Testing Decisions

- Good tests for this migration assert externally visible behavior, contract shape, upgrade safety, and verification gates rather than private implementation details.
- Typecheck is part of the test surface; `tsc --noEmit` must fail on contract drift.
- The no-JavaScript source scan must operate on versioned project-owned files, not the full filesystem, so it does not fail on dependencies, build output, or local worktrees.
- Existing Vitest coverage should be converted to TypeScript and remain behavior-equivalent.
- Shared contract tests should cover Account state, Release shape, sync status, marketplace status, collection filters, dashboard stats, and collection view preferences after conversion.
- Backend service tests should cover Database schema lifecycle, marketplace values, enrichment queue behavior, import sync state, collection reconciliation, notes normalization, exchange rates, cover media, and route-facing behavior after conversion.
- Frontend-related tests should cover routes/code splitting, columns, wall grid, import sync UI helpers, vinyl badge behavior, and any existing component-level contract behavior after conversion.
- Express request augmentation should be tested indirectly through real middleware/route behavior rather than by testing declaration files directly.
- Upgrade smoke testing should run the migrated app against persisted data representing the last canonical JavaScript version in Forgejo.
- Upgrade smoke testing should verify healthcheck, account/settings availability, Local collection reads, Dashboard basics, cached-cover continuity where practical, and preservation of Discogs configuration.
- Docker build and start behavior should be verified because self-hosted users depend on that path.
- Final verification should run source scan, typecheck, tests, and build through one command.
- Prior art includes existing tests for account contracts, release contracts, sync status contracts, marketplace contracts, dashboard stats, database migration, import sync state, preferences, export fields, and cover media.

## Out of Scope

- Changing Discographic product behavior as part of the migration.
- Redesigning Account state, Release shape, Discogs sync run, Import workflow, Marketplace enrichment, or Database schema lifecycle semantics beyond what is necessary to type existing behavior.
- Adding new user-facing features.
- Introducing a runtime validation library by default.
- Bundling the backend solely to avoid `.js` import specifiers in TypeScript source.
- Replacing Express, React, Vite, Vitest, SQLite, or the current self-hosted architecture.
- Changing database schema semantics except where existing migration code already requires it.
- Guaranteeing upgrade compatibility from every historical Discographic release.
- Publishing the migrated version to GitHub.
- Versioning generated JavaScript build output as maintained source.
- Adding ESLint as an initial migration requirement.
- Rewriting all modules for ideal architecture beyond the behavior-preserving TypeScript conversion.
- Removing local GitHub remotes from developer machines.

## Further Notes

- This PRD is based on the TypeScript-only source tree ADR, the Forgejo canonical repository ADR, and the Discographic domain context.
- The current source tree contains 106 project-owned JavaScript/JSX files outside dependencies, build output, local worktrees, and runtime data.
- The highest-risk boundaries are the shared contracts that shape Account state, Release shape, sync/import status, marketplace semantics, and Database schema lifecycle behavior.
- The migration should precede the existing product issues so future work starts from compiler-enforced contracts.
- Forgejo should receive the implementation issues and dependency links after this PRD is broken into tracer-bullet slices.
