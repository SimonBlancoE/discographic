# Contributing

Forgejo at `https://git.simonblanco.xyz/octo/discographic` is the canonical development upstream for Discographic. Open issues, branches, and pull requests there. GitHub publication can continue as a downstream mirror, but it is outside the TypeScript migration scope.

## TypeScript-only policy

- TypeScript-only is the target direction for all project-owned source, tests, and config.
- Do not add new versioned `.js`, `.jsx`, `.mjs`, or `.cjs` files.
- When a migration slice touches an existing JavaScript file, prefer converting that file to `.ts` or `.tsx` within the same slice instead of extending the JavaScript surface.
- `tsconfig.json` is the strict, no-emit typecheck baseline. `tsconfig.server.json` emits the production server entry under `dist/server`.

## Normalize untrusted boundary data once

Normalize and validate data at the first untrusted boundary, then keep the internal shape stable. This rule applies to HTTP request bodies, query params, Discogs API payloads, environment variables, database rows, imported files, browser storage, and any other untrusted boundary. Do not re-normalize the same data deeper in the call stack unless a new boundary is crossed.

## Verification

- Required before review: `npm run typecheck`, `npm run test`, and `npm run build`.
- Migration gate: `npm run verify`.
- Upgrade gate for this migration slice: `npm run test:upgrade-smoke`.
- `npm run verify` chains the tracked-file JavaScript source scan, typecheck, tests, build, and upgrade smoke in one command.
- Set `DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=true` only when Docker is unavailable locally and you need to run the non-Docker half of the upgrade smoke. Do not rely on that override for the final migration verification.
- The JavaScript scan is expected to fail until parent issue `#9` removes the remaining versioned JavaScript and JSX files.
