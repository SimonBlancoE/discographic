# Discographic

Discographic is a self-hosted app for keeping a user's Discogs collection useful as a local vinyl collection workspace. This context records project-specific language that should guide architecture decisions.

## Language

**Discogs sync run**:
A user-triggered attempt to refresh local collection data from Discogs and carry out the related follow-up work needed for the local workspace to become current.
_Avoid_: fetch job, collection download, sync route

**Local collection**:
The user-scoped SQLite copy of Discogs releases, notes, ratings, marketplace value, listing state, and cached metadata.
_Avoid_: cache, database rows

**Marketplace enrichment**:
An explicit user-triggered operation, owned by the **Discogs sync run** module, that resolves value/listing availability state for releases whose marketplace value is pending or retryable.
_Avoid_: value fetch, price lookup

**Thumbnail warmup**:
The part of a **Discogs sync run** that prepares cached cover variants for wall and poster workflows.
_Avoid_: image prefetch, cover job

**Sync adapter**:
A concrete dependency supplied to the **Discogs sync run** module for persistence, Discogs access, cover caching, marketplace enrichment, exchange rates, or time.
_Avoid_: global helper, singleton dependency

**Release shape**:
The canonical representation rules for turning stored **Local collection** release data into collection, detail, cover wall, random card, and export representations.
_Avoid_: response mapper, serializer helper

**Import workflow**:
The user flow that turns an uploaded CSV/XLSX into a preview, lets the user verify proposed release edits, applies confirmed edits locally, and then syncs those edits back to Discogs while keeping progress visible.
_Avoid_: file upload route, import parser

**Account state**:
The user's authenticated app state plus Discogs account configuration and preferences needed to decide which workflows are available.
_Avoid_: auth status, account response, frontend fallback

**Database schema lifecycle**:
The startup process that creates, migrates, indexes, and cleans stored Discographic SQLite data so the app can safely use the current schema.
_Avoid_: migration helper, startup SQL

## Relationships

- A **Discogs sync run** updates one user's **Local collection**.
- A **Discogs sync run** owns **Marketplace enrichment**, but full collection sync does not automatically start marketplace enrichment.
- A **Discogs sync run** may perform **Thumbnail warmup** after the collection page download completes.
- A **Discogs sync run** uses **Sync adapters** supplied at module creation time rather than importing production singletons directly.
- The **Discogs sync run** module returns result objects for expected start/stop conflicts and dependency failures; unexpected background failures are reflected in status.
- A **Release shape** includes export serialization because exports are another representation of **Local collection** release data.
- A **Release shape** receives already-converted price values for normal app views; export serialization receives a currency conversion adapter because export rows contain converted price columns.
- A **Release shape** should be introduced contract-first: define and test the shared release representation functions before rewiring routes.
- A **Release shape** uses explicit representation functions rather than mode strings.
- A **Release shape** owns synthetic local cover URL fields as pure string construction; it does not fetch or verify cover files.
- A **Release shape** is produced from untrusted external or stored data through explicit normalization before app code treats it as canonical.
- A **Release shape** keeps its type contract next to the normalization rules that produce it.
- An **Import workflow** has an explicit verification step before confirmed edits are synced to Discogs.
- An **Import workflow** must expose enough progress and result state for the UI to explain each step clearly and keep the user informed.
- An **Import workflow** applies confirmed edits to the **Local collection** before attempting Discogs sync, so user-confirmed edits are not lost when Discogs is unavailable.
- An **Import workflow** receives persistence, parsing, ID, clock, and translation dependencies at module creation time; Discogs access is supplied when the user confirms a preview.
- An **Import workflow** interface follows the user-visible journey: upload creates a preview, confirmation applies edits, status reports Discogs progress/result, and clearing dismisses stale results.
- An **Import workflow** returns result objects for expected user-facing failures such as invalid files, missing columns, expired previews, and no-change previews.
- **Account state** is a shared contract used by backend responses and frontend state, not a frontend-only normalization layer.
- **Account state** has one target combined shape; first adoption may bridge existing auth and account endpoints before a combined endpoint is added.
- **Account state** distinguishes unknown facts from false facts; an unavailable account uses unknown/null Discogs configuration rather than pretending Discogs is unconfigured.
- **Account state** includes computed workflow capabilities so pages do not duplicate availability rules.
- The first **Account state** implementation slice should rewire `AuthContext` to consume the shared contract rather than leaving the contract unused.
- **Account state** is produced from authentication, Discogs account, and preference facts through explicit normalization before pages use it for capability decisions.
- **Account state** keeps its type contract next to the normalization rules that produce it.
- The **Database schema lifecycle** owns base table creation, legacy table migrations, incremental column migrations, index creation, and startup data cleanup.
- The **Database schema lifecycle** exposes one startup entry point that receives an open SQLite database adapter and optional cleanup hooks.
- The **Database schema lifecycle** returns a migration report for tests and optional logging; production may ignore the report.

## Example Dialogue

> **Dev:** "Should the route own pruning and thumbnail preparation after downloading releases?"
> **Domain expert:** "No - those are part of the **Discogs sync run** because the user expects the **Local collection** to be current after syncing."

## Flagged Ambiguities

- "sync" can mean only downloading collection pages or the full user-facing refresh. Resolved: use **Discogs sync run** for the full user-facing refresh.
- **Import workflow** does not include a durable pending outbound edit queue yet. Future review should revisit whether failed Discogs sync items should be stored for retry instead of only reported in the import result.
