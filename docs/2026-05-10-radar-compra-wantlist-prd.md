# PRD: Radar de compra para Wantlist

## Problem Statement

Discographic ya ayuda a que la colección local de Discogs sea útil: sincroniza discos, notas, valoraciones, valor de Marketplace, exportaciones y vistas visuales. Pero los coleccionistas también tienen otra necesidad diaria: decidir qué comprar de su Wantlist sin revisar Discogs release por release.

Discogs ofrece Wantlist y avisos propios, pero no convierte esa lista en una herramienta de decisión tranquila: no separa bien lo que merece atención ahora, lo que está por debajo de un precio objetivo, lo que ya está en la colección local, lo que puede esperar, o lo que el usuario quiere ocultar/resolver sin tocar Discogs.

El problema a resolver es que el usuario necesita un espacio local, claro y conservador para revisar oportunidades de compra de su Wantlist, usando datos de Discogs pero sin depender de alertas agresivas, vendedores concretos ni escritura de vuelta a Discogs en la primera versión.

## Solution

Crear una nueva sección llamada **Radar**. Radar será una herramienta local, protegida por cuenta Discogs configurada, que actualiza la Wantlist, permite definir reglas personales simples, revisa precios con el mismo enfoque técnico de Marketplace enrichment que ya usa la Local collection, y muestra oportunidades con motivos explícitos.

La v1 será deliberadamente sencilla y funcional:

- Leer la Wantlist desde la API de Discogs como camino principal.
- Aceptar CSV/XLSX como fallback, con plantilla, preview, validación clara de columnas e importación parcial con advertencias.
- Guardar el estado por usuario en la base local.
- Mantener las decisiones locales dentro de Discographic.
- Usar el precio mínimo de Marketplace por release.
- Calcular oportunidades mediante reglas transparentes, no mediante un score opaco.
- Presentar Radar como un flujo guiado y compacto: una acción principal, una lista densa y una ficha de edición por release.
- No consultar listings individuales, vendedores, envíos ni condiciones reales en v1.
- No escribir cambios de vuelta a Discogs.

Radar debe responder a una pregunta concreta:

> De los discos que quiero, cuales merecen mi atención ahora y por que.

## User Stories

1. As a Discographic user, I want a Radar section, so that I can review wanted records separately from the records I already own.
2. As a Discographic user, I want Radar to require a configured Discogs account, so that opportunities are tied to the correct Discogs identity.
3. As a Discographic user, I want Radar to be unavailable without a Discogs token, so that the app does not show partial or misleading purchase data.
4. As a Discographic user, I want to update Radar from one primary action, so that Wantlist refresh and price review feel like one understandable workflow.
5. As a Discographic user, I want to import a Wantlist file as CSV or XLSX, so that I have a fallback when the Discogs API path is not enough.
6. As a Discographic user, I want a downloadable Wantlist import template, so that I know which columns Discographic understands.
7. As a Discographic user, I want the import flow to explain required columns, so that I can fix my file without guessing.
8. As a Discographic user, I want `release_id` to be the only required import column, so that a minimal Discogs export or hand-made file can work.
9. As a Discographic user, I want Spanish and English aliases for import columns, so that I can use natural spreadsheet headers.
10. As a Discographic user, I want unknown import columns to be reported as ignored, so that I understand what Discographic did not use.
11. As a Discographic user, I want invalid rows to be reported by row number, so that I can repair my Wantlist file.
12. As a Discographic user, I want valid rows to be importable even when some rows have warnings, so that one bad line does not block the whole file.
13. As a Discographic user, I want an import preview before applying changes, so that I can confirm new, updated, duplicate, ignored, and invalid rows.
14. As a Discographic user, I want API and file imports to merge by Discogs release id, so that the same wanted release does not appear twice.
15. As a Discographic user, I want Radar to preserve local decisions when API sync refreshes metadata, so that my purchase planning does not get overwritten.
16. As a Discographic user, I want releases missing from the API source to be marked instead of immediately deleted, so that local decisions are not lost accidentally.
17. As a Discographic user, I want a wanted release that reappears in the API source to recover its prior local decisions, so that temporary source changes do not erase my planning.
18. As a Discographic user, I want to set a priority of low, normal, or high, so that Radar knows which records matter most.
19. As a Discographic user, I want imported priority values to accept Spanish and English labels, so that file import is forgiving.
20. As a Discographic user, I want to set an optional target price per wanted release, so that Radar can tell me when something is worth attention.
21. As a Discographic user, I want target prices to display in my chosen currency, so that the UI matches the rest of Discographic.
22. As a Discographic user, I want target prices to be compared internally in EUR, so that changing display currency does not break opportunity rules.
23. As a Discographic user, I want to store a minimum condition preference, so that future versions can use it for listing-level decisions.
24. As a Discographic user, I want minimum condition to be clearly informational in v1, so that I do not think Radar is filtering listings by condition yet.
25. As a Discographic user, I want to write a local note per wanted release, so that I can remember why I care about it.
26. As a Discographic user, I want to hide a wanted release locally, so that low-value noise does not keep appearing in my active Radar.
27. As a Discographic user, I want to mark a wanted release as resolved locally, so that I can clear it from active planning without editing Discogs.
28. As a Discographic user, I want local hidden and resolved states to remain local, so that Discographic does not unexpectedly change my Discogs Wantlist.
29. As a Discographic user, I want to open the release in Discogs, so that I can inspect or buy through Discogs when I choose.
30. As a Discographic user, I want Radar to show when a wanted release is already in my Local collection, so that I can avoid buying duplicates by mistake.
31. As a Discographic user, I want "already in collection" to be a visible signal rather than automatic removal, so that upgrades or alternate editions remain possible.
32. As a Discographic user, I want updating Radar to include price review, so that I do not have to understand separate sync and enrichment operations.
33. As a Discographic user, I want Radar price review to follow the same policy as the Local collection, so that pending and failed marketplace values behave consistently.
34. As a Discographic user, I want Radar price review to process the full pending workset in internal batches, so that the app does not impose an arbitrary low per-run cap.
35. As a Discographic user, I want a running Radar price review to be stoppable, so that I can interrupt a long run.
36. As a Discographic user, I want failed Radar price-review rows to remain retryable, so that temporary Discogs/API failures can be retried later.
37. As a Discographic user, I want unavailable releases to stop being pending, so that Radar distinguishes "checked and no price" from "not checked yet".
38. As a Discographic user, I want visible progress while Radar reviews prices, so that I know how much work remains.
39. As a Discographic user, I want opportunities to use explicit reasons, so that I can trust why Radar promoted a record.
40. As a Discographic user, I want a record to be an opportunity when it is below my target price, so that price drops are easy to spot.
41. As a Discographic user, I want a high-priority record with an available Marketplace price to appear as an opportunity, so that important records are not missed.
42. As a Discographic user, I want a record that becomes available again to appear as an opportunity, so that I can act after a prior unavailable state.
43. As a Discographic user, I want already-owned wanted releases to appear with a clear reason, so that I can decide whether to resolve or keep pursuing them.
44. As a Discographic user, I want Radar to avoid an opaque score in v1, so that opportunity ordering remains explainable.
45. As a Discographic user, I want the default order to show the most actionable releases first, so that I can use Radar without configuration.
46. As a Discographic user, I want filters for all releases, opportunities, below target, high priority, already owned, hidden/resolved, pending, and errors, so that I can inspect different parts of the Radar.
47. As a Discographic user, I want Spanish labels such as "Por debajo del precio objetivo" and "Ya en tu colección", so that the UI feels natural.
48. As a Discographic user, I want English labels for the same states, so that the bilingual app remains complete.
49. As a Discographic user, I want a small Radar summary on the Dashboard, so that I can see whether there are active opportunities without opening Radar.
50. As a Discographic user, I want the Dashboard summary to link to Radar, so that I can move from summary to action quickly.
51. As a Discographic user, I want Radar data to be cleared when the Discogs account is changed or reset, so that data from different accounts is not mixed.
52. As an administrator of a shared instance, I want Radar data to remain user-scoped, so that each user only sees their own Wantlist and local decisions.
53. As a maintainer, I want Radar contracts to normalize untrusted stored and API data, so that frontend and backend use a stable shape.
54. As a maintainer, I want the import workflow to be a deep module with a simple preview/apply interface, so that CSV/XLSX validation can be tested without UI details.
55. As a maintainer, I want opportunity rules to live in a small tested module, so that future v2 marketplace intelligence can build on the same concepts without rewriting the UI.
56. As a maintainer, I want Radar enrichment to reuse the existing marketplace value state language, so that the system does not grow two competing price-status models.
57. As a maintainer, I want v2 marketplace concepts documented but not implemented, so that v1 leaves space for them without accidental scope creep.

## UX Overhaul Decisions

Manual testing showed that the first Radar implementation is too hard to read and too easy to misunderstand. The overhaul must make Radar feel like a guided decision workspace rather than a set of technical panels.

- The primary action is **Actualizar Radar**. It represents one **Radar update run**: refresh Wantlist data, preserve local decisions, and review pending/retryable marketplace price state.
- The interface should not present "sync" and "enrich" as competing primary operations. "Marketplace enrichment" remains implementation language; user-facing copy should use "revisar precios" or "actualizar precios".
- The top of the page should be compact: update state, last update context, the primary action, and a secondary **Importar archivo** action that scrolls to the fallback import panel.
- Radar summary cards should become operational filters, not square status counters. Primary metrics are: oportunidades, bajo objetivo, alta prioridad, ya en colección, and pendientes/incidencias.
- Total wanted releases, hidden/resolved counts, missing-from-source counts, and other technical totals are secondary context rather than first-level cards.
- The main Radar view should be a dense list similar in spirit to Collection, not large editable cards.
- The list is for scanning and navigation. It should show cover, artist/title, current price or price state, target price, priority, compact signals, Wantlist date, last price review, and an action to open the Radar detail.
- Long note, minimum condition, hidden, and resolved controls do not belong inline in every list row.
- Each wanted release has a navigable Radar detail page, for example `/radar/:id`, rather than a modal-only editor.
- The Radar detail page owns editing for priority, target price, minimum condition, local note, hidden, and resolved.
- Saving local decisions is explicit. The detail page must distinguish unsaved changes, saving, saved, and failed states, and should protect the user from leaving with unsaved changes.
- When a wanted release already exists in the Local collection, Radar must expose a collection match: at least a local release-detail link and the number of matching collection copies.
- If multiple local collection copies match the same Discogs release id, Radar links to one primary local detail and shows the copy count.
- The file import panel belongs at the bottom as a fallback workflow. The top import button scrolls to it.
- Applying a file import updates Radar locally and then guides the user back toward updating Radar or reviewing prices; it must not unexpectedly launch a full Discogs refresh.

## UX Overhaul Acceptance Criteria

- Opening Radar makes the next action obvious without reading technical panel copy.
- The primary button says **Actualizar Radar** in Spanish and represents the combined user-facing workflow.
- During a Radar update run, the UI shows understandable progress phases such as updating Wantlist, reviewing prices, completed, completed with issues, or failed.
- "Enriquecer" is not used as primary visible UI copy for Radar or other price-update controls; use "revisar precios" or "actualizar precios" instead.
- The summary area does not use nine equal square cards, and labels do not overflow their containers at supported viewport widths.
- Clicking each primary metric applies the matching list filter.
- The Radar list is substantially denser than the current card layout and does not contain large textareas or full edit forms.
- Each row can navigate to a Radar detail page.
- The Radar detail page provides explicit save feedback for success, failure, and unsaved changes.
- Rows marked as already in collection include a local Discographic link when a collection match exists.
- File import is reachable from the top action area but visually lives after the main Radar list.
- Tests cover the combined update-run contract, collection-match contract, dense-list filtering, detail-page save feedback, and fallback import placement/behavior.

## Implementation Decisions

- The feature is named **Radar** in the product navigation.
- Radar is a separate section, not part of Collection, because it represents wanted releases rather than owned releases.
- Radar requires a configured Discogs account. Without a token/account, the page is blocked and points the user to Settings.
- Radar data is user-scoped and must be cleared when the Discogs account is changed or the local collection/account cache is reset.
- API sync is the primary source for Wantlist data.
- CSV/XLSX import is the fallback source, not the primary source.
- Radar exposes **Actualizar Radar** as the primary user action rather than separate sync and enrichment controls.
- File import accepts CSV and XLSX, using the first sheet for XLSX.
- File import requires a recognized `release_id` column.
- File import recognizes optional columns for artist, title, year, notes, date added, target price, minimum condition, and priority.
- File import accepts reasonable Spanish and English aliases for supported columns.
- File import uses preview before apply and supports partial import with warnings.
- Unknown file columns are reported as ignored, not fatal.
- Missing required `release_id` or zero valid rows are fatal import errors.
- Duplicate rows within a file are reported in preview.
- API and file sources merge into one Radar item by user and Discogs release id.
- Source is tracked as API, CSV/XLSX, or both, but the list is unified.
- Local decision fields are preserved when API sync refreshes metadata.
- Items missing from a later API source are marked as missing from source rather than deleted immediately.
- Missing-from-source items are hidden from the active view by default.
- Reappearing source items recover their prior local state.
- Radar stores release metadata, local decisions, source state, marketplace value state, and timestamps separately enough that each can evolve independently.
- Local decision fields include priority, target price, minimum condition, note, hidden state, and resolved state.
- Priority is low, normal, or high. Normal is the default.
- Target price is optional and per release.
- Target price input is displayed in the user's display currency but normalized to EUR internally for stable comparison.
- Minimum condition is accepted and stored in v1 but is informational only.
- Radar does not write changes back to Discogs in v1.
- Radar does not add or remove Wantlist entries in Discogs in v1.
- Radar uses the same Marketplace stats endpoint already used by collection value enrichment.
- Radar v1 uses release-level Marketplace stats only, not listing-level marketplace data.
- Radar has its own marketplace price-review state, but the UI presents it as part of updating Radar rather than as a separate primary panel.
- Radar price review follows the Local collection policy: pending and failed are retryable, unavailable is terminal until reset, the full pending workset is processed in internal batches, progress is visible, and the run can be stopped.
- Radar opportunity rules are explicit:
  - below target price
  - high priority with available Marketplace price
  - available again after a prior unavailable state
  - already in Local collection
- Radar v1 does not use an opaque opportunity score.
- Radar default ordering prioritizes below-target opportunities, then high-priority available releases, then newly available releases, then already-owned signals, then pending/error/unavailable items, then the rest by priority and date added.
- Radar filters include all, opportunities, below target, high priority, already in collection, hidden/resolved, pending price review, and update errors.
- Radar's primary operational filters are opportunities, below target, high priority, already in collection, and pending/incidents.
- Dashboard only receives a compact Radar summary and entry link; detailed work stays in the Radar page.
- User-facing Spanish avoids "listing", "marketplace status", "item", and "enriquecer" where natural labels exist.
- The implementation should favor deep modules for:
  - Wantlist API/source normalization
  - file import preview/apply
  - Radar persistence/querying
  - Radar Marketplace enrichment workset/status
  - opportunity reason derivation and default sorting
  - shared Radar response contract

## Testing Decisions

- Tests should focus on external behavior and stable contracts, not implementation details or private helper shapes.
- Add contract tests for normalized Radar items, summaries, status values, opportunity reasons, and malformed input.
- Add service tests for API Wantlist mapping and merge behavior.
- Add import workflow tests for required columns, aliases, ignored columns, invalid release ids, invalid priority/target/year values, duplicate rows, preview counts, and partial import behavior.
- Add persistence tests for preserving local decisions across API sync and marking missing-from-source rows without deleting them.
- Add price-review tests mirroring the existing Marketplace enrichment behavior: pending workset, failed retryability, unavailable terminal state, stop/progress behavior where practical.
- Add opportunity-rule tests for below target, high priority available, available again, already in Local collection, hidden/resolved exclusion, and default ordering.
- Add account/reset tests proving Radar is cleared when the Discogs account changes or local account cache is reset.
- Add API route tests or contract-level integration tests for list, Radar update run, import preview/apply, update local decision fields, price-review progress/stop/status, and Dashboard summary.
- Add frontend tests where existing patterns support them for blocked-without-token state, import preview feedback, filters, and opportunity labels.
- Reuse prior art in the codebase:
  - shared contract normalization tests
  - import workflow preview/status tests
  - Marketplace enrichment progress tests
  - dashboard stats contract tests
  - collection table/filter state tests

## Out of Scope

The following topics are intentionally deferred to v2 or later. The v1 implementation should leave space for them in naming and data boundaries, but must not implement them now.

- Seller-specific recommendations.
- Combined purchasing by seller.
- Shipping cost calculation.
- Shipping country filtering.
- Exact listing condition filtering.
- Using minimum condition as a real opportunity filter.
- Listing-level availability details.
- Checkout, auto-buy, cart, or seller contact flows.
- Email, push, webhook, or in-app automatic alerts.
- Scheduled background jobs.
- Polling or near-real-time monitoring.
- Writing to the Discogs Wantlist.
- Removing releases from the Discogs Wantlist.
- Syncing Radar notes or priority back to Discogs.
- Price history charts.
- Historical sales comparison.
- Complex opportunity scoring.
- Global rules by artist, label, genre, country, format, or seller.
- Multi-user shared purchasing workflows.

## Further Notes

- Radar should feel like a local decision workspace, not a Marketplace automation bot.
- The first release should be useful with only release-level Marketplace stats and local rules.
- The v2 topics should be planned explicitly before implementation because they affect API usage, rate limits, storage, source freshness, user trust, and Discogs terms.
- The old "Wantlist Price Alerts" plan in the repository should be treated as superseded by this narrower Radar v1 PRD unless a future plan deliberately revives alerts.
- The wording "available again" requires remembering a prior unavailable state for a release. If implementation discovers this is too large for the first slice, preserve the data model boundary and split the visible label into a follow-up issue rather than silently faking it.
