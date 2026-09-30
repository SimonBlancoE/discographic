# Contributing

Discographic uses GitHub as its public repository. Direct contributions are not accepted as a standing policy, but feedback, issues, and pull requests are welcome and appreciated.

## TypeScript-only policy

- TypeScript-only is the target direction for all project-owned source, tests, and config.
- Do not add new versioned `.js`, `.jsx`, `.mjs`, or `.cjs` files.
- When a migration slice touches an existing JavaScript file, prefer converting that file to `.ts` or `.tsx` within the same slice instead of extending the JavaScript surface.
- `tsconfig.json` is the strict, no-emit typecheck baseline. `tsconfig.server.json` emits the production server entry under `dist/server`.

## Normalize untrusted boundary data once

Normalize and validate data at the first untrusted boundary, then keep the internal shape stable. This rule applies to HTTP request bodies, query params, Discogs API payloads, environment variables, database rows, imported files, browser storage, and any other untrusted boundary. Do not re-normalize the same data deeper in the call stack unless a new boundary is crossed.

## Verification

- Required before review: `pnpm run typecheck`, `pnpm run test`, and `pnpm run build`.
- Migration gate: `pnpm run verify`.
- Upgrade gate for this migration slice: `pnpm run test:upgrade-smoke`.
- Docker-enforced self-hosted upgrade gate: `pnpm run test:upgrade-smoke:docker`.
- Full Docker-capable upgrade-path verification for this migration slice: `pnpm run verify:upgrade-path`.
- `pnpm run verify` chains the tracked-file JavaScript source scan, typecheck, tests, build, and upgrade smoke in one command.
- `pnpm run verify:upgrade-path` is the authoritative issue-15 / PRD-9 completion gate on a Docker-capable runner.
- `pnpm run verify` and `pnpm run test:upgrade-smoke` will skip the Docker half automatically when `docker` is unavailable on PATH or the Docker daemon is unreachable.
- Use `pnpm run test:upgrade-smoke:docker` for the final migration verification in a Docker-capable environment; it clears the skip flag and treats Docker as mandatory, including a reachable Docker daemon.
- Set `DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=true` only when you need to force the non-Docker path even on a machine that has Docker.
- The JavaScript scan is expected to pass once the tracked source tree is TypeScript-only; treat any reported project-owned `.js`, `.jsx`, `.mjs`, or `.cjs` file as a regression.

## Documentation

- `README.md` is the canonical README. Mirror any content change in `README.es.md` within the same PR.
- README screenshots live in `docs/screenshots/` (`name.webp` in English, `name.es.webp` in Spanish).
- Keep local agent runners, credentials, raw review reports and execution plans outside the published source tree. Public documentation should describe the product, its supported workflows and architectural decisions. Git and Docker exclusions protect local work artifacts from accidental publication.

## Manual test instance

A throwaway, in-memory instance for QA. It does not keep any data.

```bash
pnpm run test:instance:start -- --host 127.0.0.1 --port 3801
```

It comes with two users: `admin-demo` / `demo12345` (admin) and `user-demo` / `demo12345`. Destroy it with:

```bash
pnpm run test:instance:stop -- --host 127.0.0.1 --port 3801
```

## Radar v1 guardrails

Radar (the Wantlist manager) is a local workspace, not a Marketplace automation layer.

- It uses release-level Marketplace stats and local decisions only.
- It does not implement seller recommendations, combined purchasing, shipping logic, listing-level availability, exact condition filtering, scheduled jobs, automatic alerts, price history, or complex scoring.
- It does not write Radar decisions, notes, or Wantlist membership back to Discogs.
- Minimum condition is stored as a future-facing preference and is informational only.
- The older "Wantlist Price Alerts" direction is superseded by the Radar v1 PRD unless it is explicitly revived in a later plan.
