# Wantlist Price Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discogs wantlist sync plus price/watch alerts so collectors can track wanted records, current availability, and target-price opportunities from inside Discographic.

**Architecture:** Add a dedicated wantlist domain alongside the existing collection domain: Discogs client methods fetch wantlist pages and marketplace stats, backend services normalize and persist records, Express routes expose list/sync/target-price APIs, shared contracts normalize API payloads, and React renders a new Wantlist page. Reuse existing currency conversion, auth, settings, toast, i18n, and Discogs rate-limit infrastructure.

**Tech Stack:** Node.js, Express, better-sqlite3, Discogs API, React 18, React Router, Vite, Tailwind CSS, Vitest, shared JavaScript contract modules.

---

## User story

As a vinyl collector, I want Discographic to show my Discogs wantlist with current lowest prices and target-price alerts so I can decide what to buy next without manually checking Discogs item by item.

## MVP scope

Included:

- Sync the authenticated user's Discogs wantlist.
- Store wanted releases locally in SQLite per user.
- Fetch marketplace stats for wanted releases in the user's display currency and store normalized EUR values for comparisons.
- Show a Wantlist page with search, status filters, sorting, target price, and opportunity indicators.
- Let users set or clear a target price per wanted release.
- Show summary cards: total wanted, priced wanted, target hits, unavailable, failed.
- Add manual `Sync wantlist` and `Refresh prices` actions.
- Add English and Spanish UI strings.
- Add service/contract tests.

Deferred:

- Email/push notifications.
- Background scheduled jobs.
- Full price-history charts.
- Auto-buy links or checkout flows.
- Multi-currency target prices per item; targets are stored in EUR internally and displayed in the user's selected currency.

## Discogs API assumptions

Use these Discogs endpoints through the existing `DiscogsClient.request()` rate limiter:

- `GET /users/{username}/wants?page=1&per_page=100` — wantlist page.
- `GET /marketplace/stats/{release_id}?curr_abbr=EUR` — lowest current marketplace price and availability.
- Optional later: `GET /releases/{release_id}` for richer metadata if the wantlist payload is insufficient.

The plan must verify the actual wantlist payload during implementation. The expected shape is treated defensively:

```js
{
  id: 123,
  date_added: '2025-01-01T00:00:00-08:00',
  basic_information: {
    id: 456,
    title: 'Album Title',
    year: 1977,
    artists: [{ name: 'Artist Name' }],
    labels: [{ name: 'Label' }],
    formats: [{ name: 'Vinyl' }],
    genres: ['Rock'],
    styles: ['Prog Rock'],
    cover_image: 'https://...',
    thumb: 'https://...'
  }
}
```

---

# File structure

## Create

- `shared/contracts/wantlist.js` — API payload normalizers and status constants.
- `server/services/wantlist.js` — mapping, persistence helpers, query builders, target-price helpers.
- `server/routes/wantlist.js` — authenticated Wantlist API routes.
- `src/pages/Wantlist.jsx` — Wantlist page UI.
- `tests/wantlist-contract.test.js` — contract normalization tests.
- `tests/wantlist-service.test.js` — backend service tests with an in-memory or temporary DB.
- `tests/wantlist-routes.test.js` — route-level behavior if the existing test harness supports Express route tests; otherwise keep service tests as the route safety net.

## Modify

- `server/db.js` — create current-schema tables or call migration helpers.
- `server/services/dbMigrations.js` — idempotent wantlist table migrations.
- `server/discogs.js` — add `getWantlist()`.
- `server/index.js` — mount `/api/wantlist`.
- `src/lib/api.js` — add Wantlist API methods and normalize responses.
- `src/App.jsx` — add navigation and route.
- `shared/i18n.js` — add English and Spanish copy.
- `README.md` and `README.es.md` — document Wantlist support after implementation.

---

# Data model

Add one table. Keep the schema intentionally small for MVP.

```sql
CREATE TABLE IF NOT EXISTS wantlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  release_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  year INTEGER,
  genres TEXT,
  styles TEXT,
  formats TEXT,
  labels TEXT,
  cover_url TEXT,
  date_added TEXT,
  lowest_price REAL DEFAULT NULL,
  lowest_price_currency TEXT DEFAULT 'EUR',
  lowest_price_eur REAL DEFAULT NULL,
  num_for_sale INTEGER DEFAULT NULL,
  marketplace_status TEXT DEFAULT 'pending',
  target_price_eur REAL DEFAULT NULL,
  last_price_checked_at TEXT DEFAULT NULL,
  last_sync_id INTEGER DEFAULT NULL,
  raw_json TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, release_id)
);

CREATE INDEX IF NOT EXISTS idx_wantlist_user_artist ON wantlist_items(user_id, artist);
CREATE INDEX IF NOT EXISTS idx_wantlist_user_title ON wantlist_items(user_id, title);
CREATE INDEX IF NOT EXISTS idx_wantlist_user_date_added ON wantlist_items(user_id, date_added);
CREATE INDEX IF NOT EXISTS idx_wantlist_user_price ON wantlist_items(user_id, lowest_price_eur);
CREATE INDEX IF NOT EXISTS idx_wantlist_user_status ON wantlist_items(user_id, marketplace_status);
CREATE INDEX IF NOT EXISTS idx_wantlist_user_target ON wantlist_items(user_id, target_price_eur);
```

## Status rules

| Status | Meaning |
| --- | --- |
| `pending` | Wantlist row exists but price has not been checked. |
| `priced` | Marketplace stats returned a positive lowest price. |
| `target_hit` | Marketplace stats returned a price less than or equal to the user's target. |
| `unavailable` | Marketplace stats succeeded but there are no copies for sale or no price. |
| `failed` | Marketplace stats failed after request retries. |

Important: `target_hit` is a derived alert status for UI convenience. The row should still store `lowest_price_eur` and `target_price_eur`; if target is cleared, status should return to `priced` or `unavailable` on the next normalization/update.

---

# API design

## `GET /api/wantlist`

Query params:

- `q` — search artist/title.
- `status` — one of `all`, `pending`, `priced`, `target_hit`, `unavailable`, `failed`.
- `sortBy` — one of `artist`, `title`, `year`, `date_added`, `lowest_price_eur`, `target_price_eur`.
- `sortOrder` — `asc` or `desc`.
- `page` — default `1`.
- `limit` — default `20`, max `100`.
- `currency` — display currency, same options as collection.

Response shape:

```js
{
  items: [
    {
      id: 1,
      release_id: 456,
      title: 'Album Title',
      artist: 'Artist Name',
      year: 1977,
      genres: ['Rock'],
      styles: ['Prog Rock'],
      formats: [{ name: 'Vinyl' }],
      labels: [{ name: 'Label' }],
      cover_url: 'https://...',
      date_added: '2025-01-01T00:00:00-08:00',
      lowest_price: 20,
      lowest_price_currency: 'EUR',
      lowest_price_eur: 20,
      display_lowest_price: 20,
      display_currency: 'EUR',
      num_for_sale: 3,
      marketplace_status: 'priced',
      target_price_eur: 18,
      display_target_price: 18,
      alert: false,
      last_price_checked_at: '2026-04-25T12:00:00.000Z'
    }
  ],
  summary: {
    total: 100,
    priced: 70,
    targetHits: 4,
    unavailable: 20,
    failed: 2,
    pending: 8
  },
  pagination: { page: 1, limit: 20, total: 100, totalPages: 5 },
  displayCurrency: 'EUR'
}
```

## `POST /api/wantlist/sync`

Starts a foreground request that fetches all wantlist pages and refreshes prices for changed/new rows. For MVP this may run synchronously if a typical wantlist is small; if this blocks too long, convert to a `Map` state model like `server/routes/sync.js`.

Response:

```js
{ "ok": true, "synced": 100, "removed": 3, "priced": 62, "failed": 2 }
```

## `POST /api/wantlist/prices`

Refreshes marketplace prices for currently stored wantlist rows.

Response:

```js
{ "ok": true, "checked": 100, "priced": 68, "targetHits": 5, "failed": 1 }
```

## `PUT /api/wantlist/:id/target`

Body:

```js
{ "targetPrice": 25, "currency": "EUR" }
```

Clearing target:

```js
{ "targetPrice": null }
```

Response: normalized item.

---

# Task 1: Shared Wantlist contract

**Files:**

- Create: `shared/contracts/wantlist.js`
- Create: `tests/wantlist-contract.test.js`

- [ ] **Step 1: Write failing contract tests**

Create `tests/wantlist-contract.test.js` with these cases:

```js
import { describe, expect, it } from 'vitest';
import {
  WANTLIST_STATUS,
  normalizeWantlistItem,
  normalizeWantlistResponse,
  isWantlistTargetHit
} from '../shared/contracts/wantlist.js';

describe('wantlist contract', () => {
  it('normalizes a full wantlist item', () => {
    const item = normalizeWantlistItem({
      id: 1,
      release_id: 456,
      title: 'Album Title',
      artist: 'Artist Name',
      year: '1977',
      genres: '["Rock"]',
      styles: ['Prog Rock'],
      formats: [{ name: 'Vinyl' }],
      labels: [{ name: 'Label' }],
      cover_url: 'https://example.test/cover.jpg',
      date_added: '2025-01-01T00:00:00-08:00',
      lowest_price: '20.5',
      lowest_price_currency: 'EUR',
      lowest_price_eur: '20.5',
      display_lowest_price: '20.5',
      display_currency: 'EUR',
      num_for_sale: '3',
      marketplace_status: 'priced',
      target_price_eur: '25',
      display_target_price: '25',
      last_price_checked_at: '2026-04-25T12:00:00.000Z'
    });

    expect(item).toMatchObject({
      id: 1,
      release_id: 456,
      title: 'Album Title',
      artist: 'Artist Name',
      year: 1977,
      genres: ['Rock'],
      styles: ['Prog Rock'],
      lowest_price_eur: 20.5,
      display_lowest_price: 20.5,
      num_for_sale: 3,
      marketplace_status: WANTLIST_STATUS.PRICED,
      alert: true
    });
  });

  it('defaults invalid rows safely', () => {
    const item = normalizeWantlistItem({ id: 'bad', release_id: null });
    expect(item).toMatchObject({
      id: null,
      release_id: null,
      title: '-',
      artist: '-',
      genres: [],
      styles: [],
      marketplace_status: WANTLIST_STATUS.PENDING,
      alert: false
    });
  });

  it('detects target hits only when both values exist', () => {
    expect(isWantlistTargetHit({ lowest_price_eur: 10, target_price_eur: 12 })).toBe(true);
    expect(isWantlistTargetHit({ lowest_price_eur: 13, target_price_eur: 12 })).toBe(false);
    expect(isWantlistTargetHit({ lowest_price_eur: null, target_price_eur: 12 })).toBe(false);
    expect(isWantlistTargetHit({ lowest_price_eur: 10, target_price_eur: null })).toBe(false);
  });

  it('normalizes response summary and pagination', () => {
    const payload = normalizeWantlistResponse({
      items: [{ id: 1, release_id: 456, title: 'T', artist: 'A' }],
      summary: { total: '2', priced: '1', targetHits: '1' },
      pagination: { page: '1', limit: '20', total: '2', totalPages: '1' },
      displayCurrency: 'USD'
    });

    expect(payload.items).toHaveLength(1);
    expect(payload.summary).toMatchObject({ total: 2, priced: 1, targetHits: 1, unavailable: 0, failed: 0, pending: 0 });
    expect(payload.pagination).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(payload.displayCurrency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/wantlist-contract.test.js
```

Expected: FAIL because `shared/contracts/wantlist.js` does not exist.

- [ ] **Step 3: Create contract module**

Create `shared/contracts/wantlist.js`:

```js
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value, fallback = '') {
  return typeof value === 'string' && value.length ? value : fallback;
}

export const WANTLIST_STATUS = Object.freeze({
  PENDING: 'pending',
  PRICED: 'priced',
  TARGET_HIT: 'target_hit',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed'
});

const VALID_STATUS = new Set(Object.values(WANTLIST_STATUS));

export function normalizeWantlistStatus(value) {
  return VALID_STATUS.has(value) ? value : WANTLIST_STATUS.PENDING;
}

export function isWantlistTargetHit(item) {
  const lowest = asNullableNumber(item?.lowest_price_eur);
  const target = asNullableNumber(item?.target_price_eur);
  return lowest != null && target != null && lowest <= target;
}

export function normalizeWantlistItem(row = {}) {
  const normalized = {
    id: asNullableNumber(row.id),
    release_id: asNullableNumber(row.release_id),
    title: asText(row.title, '-'),
    artist: asText(row.artist, '-'),
    year: asNullableNumber(row.year),
    genres: asArray(row.genres),
    styles: asArray(row.styles),
    formats: asArray(row.formats),
    labels: asArray(row.labels),
    cover_url: typeof row.cover_url === 'string' ? row.cover_url : null,
    date_added: typeof row.date_added === 'string' ? row.date_added : null,
    lowest_price: asNullableNumber(row.lowest_price),
    lowest_price_currency: asText(row.lowest_price_currency, 'EUR'),
    lowest_price_eur: asNullableNumber(row.lowest_price_eur),
    display_lowest_price: asNullableNumber(row.display_lowest_price),
    display_currency: asText(row.display_currency, row.displayCurrency || 'EUR'),
    num_for_sale: asNullableNumber(row.num_for_sale),
    marketplace_status: normalizeWantlistStatus(row.marketplace_status),
    target_price_eur: asNullableNumber(row.target_price_eur),
    display_target_price: asNullableNumber(row.display_target_price),
    last_price_checked_at: typeof row.last_price_checked_at === 'string' ? row.last_price_checked_at : null
  };

  return {
    ...normalized,
    alert: isWantlistTargetHit(normalized)
  };
}

export function normalizeWantlistResponse(payload = {}) {
  const summary = payload.summary || {};
  const pagination = payload.pagination || {};

  return {
    items: asArray(payload.items).map(normalizeWantlistItem),
    summary: {
      total: asNumber(summary.total),
      priced: asNumber(summary.priced),
      targetHits: asNumber(summary.targetHits),
      unavailable: asNumber(summary.unavailable),
      failed: asNumber(summary.failed),
      pending: asNumber(summary.pending)
    },
    pagination: {
      page: asNumber(pagination.page, 1),
      limit: asNumber(pagination.limit, 20),
      total: asNumber(pagination.total),
      totalPages: asNumber(pagination.totalPages, 1)
    },
    displayCurrency: typeof payload.displayCurrency === 'string' ? payload.displayCurrency : 'EUR'
  };
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
npm test -- tests/wantlist-contract.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/contracts/wantlist.js tests/wantlist-contract.test.js
git commit -m "feat: add wantlist contract"
```

---

# Task 2: Database migration and service helpers

**Files:**

- Modify: `server/services/dbMigrations.js`
- Modify: `server/db.js`
- Create: `server/services/wantlist.js`
- Create: `tests/wantlist-service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/wantlist-service.test.js` with service-level tests for mapping and target status. If project tests use the real app DB, isolate this test with a temporary database helper before implementation; do not write to a developer's real collection database.

```js
import { describe, expect, it } from 'vitest';
import {
  computeWantlistStatus,
  mapWantlistItem,
  mapMarketplaceStats
} from '../server/services/wantlist.js';
import { WANTLIST_STATUS } from '../shared/contracts/wantlist.js';

describe('wantlist service', () => {
  it('maps a Discogs wantlist item into a stored row', () => {
    const row = mapWantlistItem({
      id: 1,
      date_added: '2025-01-01T00:00:00-08:00',
      basic_information: {
        id: 456,
        title: 'Album Title',
        year: 1977,
        artists: [{ name: 'Artist Name' }],
        labels: [{ name: 'Label' }],
        formats: [{ name: 'Vinyl' }],
        genres: ['Rock'],
        styles: ['Prog Rock'],
        cover_image: 'https://example.test/cover.jpg'
      }
    });

    expect(row).toMatchObject({
      release_id: 456,
      title: 'Album Title',
      artist: 'Artist Name',
      year: 1977,
      cover_url: 'https://example.test/cover.jpg',
      date_added: '2025-01-01T00:00:00-08:00'
    });
    expect(JSON.parse(row.genres)).toEqual(['Rock']);
  });

  it('maps marketplace stats into priced status', () => {
    expect(mapMarketplaceStats({ lowest_price: { value: 19.95, currency: 'EUR' }, num_for_sale: 4 })).toMatchObject({
      lowestPrice: 19.95,
      currency: 'EUR',
      numForSale: 4,
      marketplaceStatus: WANTLIST_STATUS.PRICED
    });
  });

  it('maps empty marketplace stats into unavailable status', () => {
    expect(mapMarketplaceStats({ num_for_sale: 0 })).toMatchObject({
      lowestPrice: null,
      numForSale: 0,
      marketplaceStatus: WANTLIST_STATUS.UNAVAILABLE
    });
  });

  it('computes target-hit status when price is below target', () => {
    expect(computeWantlistStatus({ marketplaceStatus: WANTLIST_STATUS.PRICED, lowestPriceEur: 10, targetPriceEur: 12 })).toBe(WANTLIST_STATUS.TARGET_HIT);
    expect(computeWantlistStatus({ marketplaceStatus: WANTLIST_STATUS.PRICED, lowestPriceEur: 13, targetPriceEur: 12 })).toBe(WANTLIST_STATUS.PRICED);
    expect(computeWantlistStatus({ marketplaceStatus: WANTLIST_STATUS.UNAVAILABLE, lowestPriceEur: null, targetPriceEur: 12 })).toBe(WANTLIST_STATUS.UNAVAILABLE);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/wantlist-service.test.js
```

Expected: FAIL because `server/services/wantlist.js` does not exist.

- [ ] **Step 3: Add migration helper**

Modify `server/services/dbMigrations.js` to export `migrateWantlistItems(db)`:

```js
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function getColumns(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function hasColumn(db, tableName, columnName) {
  return getColumns(db, tableName).some((column) => column.name === columnName);
}

export function migrateWantlistItems(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wantlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      release_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      year INTEGER,
      genres TEXT,
      styles TEXT,
      formats TEXT,
      labels TEXT,
      cover_url TEXT,
      date_added TEXT,
      lowest_price REAL DEFAULT NULL,
      lowest_price_currency TEXT DEFAULT 'EUR',
      lowest_price_eur REAL DEFAULT NULL,
      num_for_sale INTEGER DEFAULT NULL,
      marketplace_status TEXT DEFAULT 'pending',
      target_price_eur REAL DEFAULT NULL,
      last_price_checked_at TEXT DEFAULT NULL,
      last_sync_id INTEGER DEFAULT NULL,
      raw_json TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, release_id)
    );

    CREATE INDEX IF NOT EXISTS idx_wantlist_user_artist ON wantlist_items(user_id, artist);
    CREATE INDEX IF NOT EXISTS idx_wantlist_user_title ON wantlist_items(user_id, title);
    CREATE INDEX IF NOT EXISTS idx_wantlist_user_date_added ON wantlist_items(user_id, date_added);
    CREATE INDEX IF NOT EXISTS idx_wantlist_user_price ON wantlist_items(user_id, lowest_price_eur);
    CREATE INDEX IF NOT EXISTS idx_wantlist_user_status ON wantlist_items(user_id, marketplace_status);
    CREATE INDEX IF NOT EXISTS idx_wantlist_user_target ON wantlist_items(user_id, target_price_eur);
  `);

  if (!hasColumn(db, 'wantlist_items', 'last_sync_id')) {
    db.exec('ALTER TABLE wantlist_items ADD COLUMN last_sync_id INTEGER DEFAULT NULL');
  }
}
```

If `server/services/dbMigrations.js` already contains local helpers with these names, reuse existing helpers and only add `migrateWantlistItems`.

- [ ] **Step 4: Call migration during startup**

Modify `server/db.js` imports and startup calls:

```js
import { migrateMarketplaceStatus, migrateWantlistItems } from './services/dbMigrations.js';
```

After `migrateMarketplaceStatus(db);`, add:

```js
migrateWantlistItems(db);
```

- [ ] **Step 5: Create service helpers**

Create `server/services/wantlist.js`:

```js
import { WANTLIST_STATUS } from '../../shared/contracts/wantlist.js';
import { stringifyJson } from './jsonStorage.js';

export const WANTLIST_SORT_COLUMNS = new Set([
  'artist',
  'title',
  'year',
  'date_added',
  'lowest_price_eur',
  'target_price_eur'
]);

export function mapWantlistItem(item) {
  const info = item?.basic_information || {};
  return {
    release_id: Number(info.id || item?.id) || null,
    title: info.title || 'Sin titulo',
    artist: (info.artists || []).map((artist) => artist.name).filter(Boolean).join(', ') || 'Artista desconocido',
    year: Number(info.year) || null,
    genres: stringifyJson(info.genres || []),
    styles: stringifyJson(info.styles || []),
    formats: stringifyJson(info.formats || []),
    labels: stringifyJson(info.labels || []),
    cover_url: info.cover_image || info.thumb || null,
    date_added: item?.date_added || null,
    raw_json: JSON.stringify(item || {})
  };
}

export function mapMarketplaceStats(stats) {
  const lowestPrice = stats?.lowest_price?.value == null ? null : Number(stats.lowest_price.value);
  const currency = (stats?.lowest_price?.currency || 'EUR').toUpperCase();
  const numForSale = stats?.num_for_sale == null ? null : Number(stats.num_for_sale);

  if (Number.isFinite(lowestPrice) && lowestPrice > 0) {
    return {
      lowestPrice,
      currency,
      numForSale: Number.isFinite(numForSale) ? numForSale : null,
      marketplaceStatus: WANTLIST_STATUS.PRICED
    };
  }

  return {
    lowestPrice: null,
    currency,
    numForSale: Number.isFinite(numForSale) ? numForSale : null,
    marketplaceStatus: WANTLIST_STATUS.UNAVAILABLE
  };
}

export function computeWantlistStatus({ marketplaceStatus, lowestPriceEur, targetPriceEur }) {
  if (marketplaceStatus !== WANTLIST_STATUS.PRICED && marketplaceStatus !== WANTLIST_STATUS.TARGET_HIT) {
    return marketplaceStatus || WANTLIST_STATUS.PENDING;
  }

  if (lowestPriceEur != null && targetPriceEur != null && Number(lowestPriceEur) <= Number(targetPriceEur)) {
    return WANTLIST_STATUS.TARGET_HIT;
  }

  return WANTLIST_STATUS.PRICED;
}

export function buildWantlistWhere({ userId, query = {} }) {
  const clauses = ['user_id = ?'];
  const params = [userId];

  const search = String(query.q || '').trim();
  if (search) {
    clauses.push('(artist LIKE ? OR title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const status = String(query.status || 'all');
  if (status && status !== 'all') {
    clauses.push('marketplace_status = ?');
    params.push(status);
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}
```

- [ ] **Step 6: Run service tests**

```bash
npm test -- tests/wantlist-service.test.js tests/wantlist-contract.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/dbMigrations.js server/db.js server/services/wantlist.js tests/wantlist-service.test.js
git commit -m "feat: add wantlist persistence helpers"
```

---

# Task 3: Discogs client support

**Files:**

- Modify: `server/discogs.js`
- Extend: `tests/wantlist-service.test.js` or add `tests/discogs-client.test.js` if the project already has client endpoint tests.

- [ ] **Step 1: Add test for wantlist endpoint string**

If a Discogs client test harness exists, assert `getWantlist(2, 50)` calls:

```txt
/users/test-user/wants?page=2&per_page=50
```

If no harness exists, keep this as a small manual review step because `DiscogsClient.request()` is not currently dependency-injected.

- [ ] **Step 2: Add method to DiscogsClient**

Modify `server/discogs.js`:

```js
getWantlist(page = 1, perPage = 100) {
  return this.request(
    `/users/${this.username}/wants?page=${page}&per_page=${perPage}`
  );
}
```

Place it near `getCollection()` because both are user-library paging APIs.

- [ ] **Step 3: Verify syntax and tests**

Run:

```bash
npm test -- tests/wantlist-service.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/discogs.js
git commit -m "feat: add Discogs wantlist client method"
```

---

# Task 4: Wantlist API routes

**Files:**

- Create: `server/routes/wantlist.js`
- Modify: `server/index.js`
- Modify: `server/services/wantlist.js`
- Test: `tests/wantlist-service.test.js` and route tests if available.

- [ ] **Step 1: Add backend service functions**

Extend `server/services/wantlist.js` with:

```js
import { parseJson } from './jsonStorage.js';
import { convertAmountWithRates, DEFAULT_CURRENCY, getExchangeSnapshot } from './exchangeRates.js';

export function hydrateWantlistRow(row) {
  if (!row) return null;
  return {
    ...row,
    genres: parseJson(row.genres, []),
    styles: parseJson(row.styles, []),
    formats: parseJson(row.formats, []),
    labels: parseJson(row.labels, [])
  };
}

export function upsertWantlistBatch(db, userId, syncId, items) {
  const stmt = db.prepare(`
    INSERT INTO wantlist_items (
      user_id, release_id, title, artist, year, genres, styles, formats, labels,
      cover_url, date_added, marketplace_status, last_sync_id, raw_json, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, release_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      year = excluded.year,
      genres = excluded.genres,
      styles = excluded.styles,
      formats = excluded.formats,
      labels = excluded.labels,
      cover_url = excluded.cover_url,
      date_added = excluded.date_added,
      last_sync_id = excluded.last_sync_id,
      raw_json = excluded.raw_json,
      synced_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      const mapped = mapWantlistItem(item);
      if (!mapped.release_id) continue;
      stmt.run(
        userId,
        mapped.release_id,
        mapped.title,
        mapped.artist,
        mapped.year,
        mapped.genres,
        mapped.styles,
        mapped.formats,
        mapped.labels,
        mapped.cover_url,
        mapped.date_added,
        syncId,
        mapped.raw_json
      );
    }
  });

  tx();
}

export function pruneWantlistRows(db, userId, syncId) {
  const info = db.prepare('DELETE FROM wantlist_items WHERE user_id = ? AND last_sync_id IS NOT ?').run(userId, syncId);
  return info.changes;
}

export async function refreshWantlistPrices({ db, userId, discogs }) {
  const rows = db.prepare('SELECT id, release_id, target_price_eur FROM wantlist_items WHERE user_id = ? ORDER BY date_added DESC').all(userId);
  const exchangeSnapshot = await getExchangeSnapshot([DEFAULT_CURRENCY]);
  const update = db.prepare(`
    UPDATE wantlist_items
    SET lowest_price = ?,
        lowest_price_currency = ?,
        lowest_price_eur = ?,
        num_for_sale = ?,
        marketplace_status = ?,
        last_price_checked_at = CURRENT_TIMESTAMP,
        synced_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);

  const result = { checked: 0, priced: 0, targetHits: 0, failed: 0 };

  for (const row of rows) {
    result.checked += 1;
    try {
      const stats = await discogs.getMarketplaceStats(row.release_id, DEFAULT_CURRENCY);
      const mapped = mapMarketplaceStats(stats);
      const priceEur = mapped.lowestPrice == null
        ? null
        : convertAmountWithRates(mapped.lowestPrice, mapped.currency, DEFAULT_CURRENCY, exchangeSnapshot.rates);
      const status = computeWantlistStatus({
        marketplaceStatus: mapped.marketplaceStatus,
        lowestPriceEur: priceEur,
        targetPriceEur: row.target_price_eur
      });

      if (status === WANTLIST_STATUS.TARGET_HIT) result.targetHits += 1;
      if (status === WANTLIST_STATUS.PRICED || status === WANTLIST_STATUS.TARGET_HIT) result.priced += 1;

      update.run(mapped.lowestPrice, mapped.currency, priceEur, mapped.numForSale, status, row.id, userId);
    } catch (error) {
      result.failed += 1;
      update.run(null, DEFAULT_CURRENCY, null, null, WANTLIST_STATUS.FAILED, row.id, userId);
    }
  }

  return result;
}
```

- [ ] **Step 2: Create route file**

Create `server/routes/wantlist.js`:

```js
import express from 'express';
import db, { getSettingForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertAmount, convertAmountWithRates, getExchangeSnapshot, normalizeCurrency } from '../services/exchangeRates.js';
import {
  WANTLIST_SORT_COLUMNS,
  buildWantlistWhere,
  computeWantlistStatus,
  hydrateWantlistRow,
  pruneWantlistRows,
  refreshWantlistPrices,
  upsertWantlistBatch
} from '../services/wantlist.js';
import { normalizeWantlistItem, normalizeWantlistResponse, WANTLIST_STATUS } from '../../shared/contracts/wantlist.js';

const router = express.Router();
const PER_PAGE = 100;

router.use(requireAuth);

function getDisplayCurrency(req) {
  return normalizeCurrency(req.query.currency || getSettingForUser(req.session.userId, 'currency', DEFAULT_CURRENCY));
}

async function convertItemForDisplay(row, displayCurrency) {
  const hydrated = hydrateWantlistRow(row);
  const displayLowest = hydrated.lowest_price_eur == null ? null : await convertAmount(hydrated.lowest_price_eur, DEFAULT_CURRENCY, displayCurrency);
  const displayTarget = hydrated.target_price_eur == null ? null : await convertAmount(hydrated.target_price_eur, DEFAULT_CURRENCY, displayCurrency);

  return normalizeWantlistItem({
    ...hydrated,
    display_lowest_price: displayLowest,
    display_target_price: displayTarget,
    display_currency: displayCurrency
  });
}

function getSummary(userId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN marketplace_status IN ('priced', 'target_hit') THEN 1 ELSE 0 END) AS priced,
      SUM(CASE WHEN marketplace_status = 'target_hit' THEN 1 ELSE 0 END) AS targetHits,
      SUM(CASE WHEN marketplace_status = 'unavailable' THEN 1 ELSE 0 END) AS unavailable,
      SUM(CASE WHEN marketplace_status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN marketplace_status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM wantlist_items
    WHERE user_id = ?
  `).get(userId);

  return {
    total: row.total || 0,
    priced: row.priced || 0,
    targetHits: row.targetHits || 0,
    unavailable: row.unavailable || 0,
    failed: row.failed || 0,
    pending: row.pending || 0
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const sortBy = WANTLIST_SORT_COLUMNS.has(req.query.sortBy) ? req.query.sortBy : 'date_added';
    const sortOrder = String(req.query.sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const displayCurrency = getDisplayCurrency(req);
    const { clause, params } = buildWantlistWhere({ userId, query: req.query });

    const total = db.prepare(`SELECT COUNT(*) AS count FROM wantlist_items ${clause}`).get(...params).count;
    const rows = db.prepare(`
      SELECT *
      FROM wantlist_items
      ${clause}
      ORDER BY ${sortBy} ${sortOrder}, artist ASC, title ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const items = await Promise.all(rows.map((row) => convertItemForDisplay(row, displayCurrency)));

    return res.json(normalizeWantlistResponse({
      items,
      summary: getSummary(userId),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      displayCurrency
    }));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const userId = req.session.userId;
    const discogs = getDiscogsClientForUser(req);
    const syncId = Date.now();
    const firstPage = await discogs.getWantlist(1, PER_PAGE);
    const totalPages = firstPage?.pagination?.pages || 0;
    let synced = 0;

    for (let page = 1; page <= totalPages; page += 1) {
      const payload = page === 1 ? firstPage : await discogs.getWantlist(page, PER_PAGE);
      const wants = payload?.wants || [];
      upsertWantlistBatch(db, userId, syncId, wants);
      synced += wants.length;
    }

    const removed = pruneWantlistRows(db, userId, syncId);
    const prices = await refreshWantlistPrices({ db, userId, discogs });

    return res.json({ ok: true, synced, removed, ...prices });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/prices', async (req, res) => {
  try {
    const result = await refreshWantlistPrices({ db, userId: req.session.userId, discogs: getDiscogsClientForUser(req) });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/:id/target', async (req, res) => {
  try {
    const userId = req.session.userId;
    const displayCurrency = normalizeCurrency(req.body.currency || getSettingForUser(userId, 'currency', DEFAULT_CURRENCY));
    const targetPrice = req.body.targetPrice == null || req.body.targetPrice === '' ? null : Number(req.body.targetPrice);

    if (targetPrice != null && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
      return res.status(400).json({ error: req.t('backend.wantlist.invalidTarget') });
    }

    const exchangeSnapshot = await getExchangeSnapshot([displayCurrency]);
    const targetPriceEur = targetPrice == null
      ? null
      : convertAmountWithRates(targetPrice, displayCurrency, DEFAULT_CURRENCY, exchangeSnapshot.rates);

    const row = db.prepare('SELECT * FROM wantlist_items WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!row) {
      return res.status(404).json({ error: req.t('backend.wantlist.notFound') });
    }

    const status = computeWantlistStatus({
      marketplaceStatus: row.marketplace_status,
      lowestPriceEur: row.lowest_price_eur,
      targetPriceEur
    });

    db.prepare(`
      UPDATE wantlist_items
      SET target_price_eur = ?, marketplace_status = ?, synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(targetPriceEur, status, req.params.id, userId);

    const updated = db.prepare('SELECT * FROM wantlist_items WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    return res.json(await convertItemForDisplay(updated, displayCurrency));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
```

- [ ] **Step 3: Mount route**

Modify `server/index.js`:

```js
import wantlistRouter from './routes/wantlist.js';
```

Add with other API mounts:

```js
app.use('/api/wantlist', wantlistRouter);
```

- [ ] **Step 4: Add i18n backend errors**

Modify `shared/i18n.js` in both Spanish and English dictionaries:

```js
'backend.wantlist.invalidTarget': 'Target price must be a valid positive number',
'backend.wantlist.notFound': 'Wantlist item not found',
```

Spanish equivalent:

```js
'backend.wantlist.invalidTarget': 'El precio objetivo debe ser un numero positivo valido',
'backend.wantlist.notFound': 'Elemento de wantlist no encontrado',
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/wantlist-contract.test.js tests/wantlist-service.test.js tests/i18n-columns.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/wantlist.js server/index.js server/services/wantlist.js shared/i18n.js
git commit -m "feat: add wantlist API"
```

---

# Task 5: Frontend API client

**Files:**

- Modify: `src/lib/api.js`
- Test: contract tests already cover normalization.

- [ ] **Step 1: Import normalizer**

Modify `src/lib/api.js`:

```js
import { normalizeWantlistItem, normalizeWantlistResponse } from '../../shared/contracts/wantlist.js';
```

- [ ] **Step 2: Add API methods**

Add to exported `api` object:

```js
getWantlist: async (params = {}) => normalizeWantlistResponse(
  await request(`/wantlist?${new URLSearchParams(params).toString()}`)
),
syncWantlist: () => request('/wantlist/sync', { method: 'POST' }),
refreshWantlistPrices: () => request('/wantlist/prices', { method: 'POST' }),
setWantlistTarget: async (id, payload) => normalizeWantlistItem(
  await request(`/wantlist/${id}/target`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
),
```

Place these near collection APIs.

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/wantlist-contract.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: add wantlist client API"
```

---

# Task 6: Wantlist page UI

**Files:**

- Create: `src/pages/Wantlist.jsx`
- Modify: `src/App.jsx`
- Modify: `shared/i18n.js`

- [ ] **Step 1: Add UI strings**

Add English keys to `shared/i18n.js`:

```js
'nav.wantlist': 'Wantlist',
'wantlist.eyebrow': 'Discogs wantlist',
'wantlist.title': 'Hunt list',
'wantlist.subtitle': '{count} wanted releases · {hits} target hits',
'wantlist.sync': 'Sync wantlist',
'wantlist.refreshPrices': 'Refresh prices',
'wantlist.searchPlaceholder': 'Search wanted artists or titles...',
'wantlist.statusAll': 'All statuses',
'wantlist.statusPending': 'Pending',
'wantlist.statusPriced': 'Priced',
'wantlist.statusTargetHit': 'Target hit',
'wantlist.statusUnavailable': 'Unavailable',
'wantlist.statusFailed': 'Failed',
'wantlist.total': 'Wanted',
'wantlist.priced': 'Priced',
'wantlist.targetHits': 'Target hits',
'wantlist.unavailable': 'Unavailable',
'wantlist.failed': 'Failed',
'wantlist.pending': 'Pending',
'wantlist.lowestPrice': 'Lowest price',
'wantlist.targetPrice': 'Target price',
'wantlist.numForSale': 'For sale',
'wantlist.lastChecked': 'Checked',
'wantlist.setTarget': 'Set target',
'wantlist.clearTarget': 'Clear',
'wantlist.empty': 'Sync your Discogs wantlist to start tracking buying opportunities.',
'wantlist.loadError': 'Could not load wantlist: {error}',
'wantlist.syncDone': 'Wantlist synced: {count} releases.',
'wantlist.priceRefreshDone': 'Prices refreshed: {count} checked, {hits} target hits.',
'wantlist.targetSaved': 'Target price saved.',
'wantlist.targetCleared': 'Target price cleared.'
```

Add Spanish equivalents:

```js
'nav.wantlist': 'Wantlist',
'wantlist.eyebrow': 'Wantlist de Discogs',
'wantlist.title': 'Lista de caza',
'wantlist.subtitle': '{count} discos buscados · {hits} objetivos alcanzados',
'wantlist.sync': 'Sincronizar wantlist',
'wantlist.refreshPrices': 'Actualizar precios',
'wantlist.searchPlaceholder': 'Buscar artistas o titulos deseados...',
'wantlist.statusAll': 'Todos los estados',
'wantlist.statusPending': 'Pendiente',
'wantlist.statusPriced': 'Con precio',
'wantlist.statusTargetHit': 'Objetivo alcanzado',
'wantlist.statusUnavailable': 'No disponible',
'wantlist.statusFailed': 'Fallido',
'wantlist.total': 'Buscados',
'wantlist.priced': 'Con precio',
'wantlist.targetHits': 'Objetivos',
'wantlist.unavailable': 'No disponibles',
'wantlist.failed': 'Fallidos',
'wantlist.pending': 'Pendientes',
'wantlist.lowestPrice': 'Precio minimo',
'wantlist.targetPrice': 'Precio objetivo',
'wantlist.numForSale': 'En venta',
'wantlist.lastChecked': 'Revisado',
'wantlist.setTarget': 'Guardar objetivo',
'wantlist.clearTarget': 'Borrar',
'wantlist.empty': 'Sincroniza tu wantlist de Discogs para empezar a detectar oportunidades.',
'wantlist.loadError': 'No se pudo cargar la wantlist: {error}',
'wantlist.syncDone': 'Wantlist sincronizada: {count} discos.',
'wantlist.priceRefreshDone': 'Precios actualizados: {count} revisados, {hits} objetivos alcanzados.',
'wantlist.targetSaved': 'Precio objetivo guardado.',
'wantlist.targetCleared': 'Precio objetivo borrado.'
```

- [ ] **Step 2: Create page component**

Create `src/pages/Wantlist.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../shared/currency';

const STATUS_OPTIONS = [
  ['all', 'wantlist.statusAll'],
  ['pending', 'wantlist.statusPending'],
  ['priced', 'wantlist.statusPriced'],
  ['target_hit', 'wantlist.statusTargetHit'],
  ['unavailable', 'wantlist.statusUnavailable'],
  ['failed', 'wantlist.statusFailed']
];

function SummaryCard({ label, value, tone }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className={`mt-3 font-display text-3xl ${tone || 'text-white'}`}>{formatNumber(value || 0)}</p>
    </div>
  );
}

function TargetEditor({ item, currency, onSave }) {
  const { t } = useI18n();
  const [value, setValue] = useState(item.display_target_price ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(item.display_target_price ?? '');
  }, [item.id, item.display_target_price]);

  async function save(nextValue) {
    setSaving(true);
    try {
      await onSave(item, nextValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-[190px] items-center gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-24 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-300"
        aria-label={t('wantlist.targetPrice')}
      />
      <span className="text-xs text-slate-400">{currency}</span>
      <button type="button" disabled={saving} onClick={() => save(value)} className="secondary-button px-3 py-2 text-xs disabled:opacity-60">
        {t('wantlist.setTarget')}
      </button>
      {item.target_price_eur != null ? (
        <button type="button" disabled={saving} onClick={() => save(null)} className="text-xs text-slate-400 transition hover:text-slate-100">
          {t('wantlist.clearTarget')}
        </button>
      ) : null}
    </div>
  );
}

function Wantlist() {
  const { accountUnavailable, discogsConfigured, currency } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [payload, setPayload] = useState({ items: [], summary: {}, pagination: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('date_added');
  const [sortOrder, setSortOrder] = useState('desc');
  const [displayCurrency, setDisplayCurrency] = useState(currency || DEFAULT_CURRENCY);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDisplayCurrency(currency || DEFAULT_CURRENCY);
  }, [currency]);

  async function load(next = {}) {
    try {
      setLoading(true);
      const response = await api.getWantlist({
        q: next.search ?? search,
        status: next.status ?? status,
        page: next.page ?? page,
        sortBy: next.sortBy ?? sortBy,
        sortOrder: next.sortOrder ?? sortOrder,
        currency: next.currency ?? displayCurrency
      });
      setPayload(response);
    } catch (error) {
      toast.error(t('wantlist.loadError', { error: error.message }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, sortBy, sortOrder, displayCurrency]);

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    load({ page: 1 });
  }

  function changeStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(1);
    load({ status: nextStatus, page: 1 });
  }

  function handleSort(column) {
    const nextOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(nextOrder);
  }

  async function syncWantlist() {
    setSyncing(true);
    try {
      const result = await api.syncWantlist();
      toast.success(t('wantlist.syncDone', { count: formatNumber(result.synced || 0) }));
      await load({ page: 1 });
      setPage(1);
    } catch (error) {
      toast.error(t('wantlist.loadError', { error: error.message }));
    } finally {
      setSyncing(false);
    }
  }

  async function refreshPrices() {
    setRefreshing(true);
    try {
      const result = await api.refreshWantlistPrices();
      toast.success(t('wantlist.priceRefreshDone', { count: formatNumber(result.checked || 0), hits: formatNumber(result.targetHits || 0) }));
      await load();
    } catch (error) {
      toast.error(t('wantlist.loadError', { error: error.message }));
    } finally {
      setRefreshing(false);
    }
  }

  async function saveTarget(item, targetPrice) {
    const updated = await api.setWantlistTarget(item.id, { targetPrice, currency: displayCurrency });
    setPayload((current) => ({
      ...current,
      items: current.items.map((row) => row.id === updated.id ? updated : row)
    }));
    toast.success(targetPrice == null ? t('wantlist.targetCleared') : t('wantlist.targetSaved'));
    await load();
  }

  const summary = payload.summary || {};
  const subtitle = t('wantlist.subtitle', { count: formatNumber(summary.total || 0), hits: formatNumber(summary.targetHits || 0) });

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('wantlist.eyebrow')}</p>
          <h2 className="mt-2 font-display text-4xl text-white">{t('wantlist.title')}</h2>
          <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value)} className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none">
            {SUPPORTED_CURRENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button type="button" disabled={!discogsConfigured || syncing} onClick={syncWantlist} className="primary-button disabled:opacity-60">
            {syncing ? t('app.loading') : t('wantlist.sync')}
          </button>
          <button type="button" disabled={!discogsConfigured || refreshing || !summary.total} onClick={refreshPrices} className="secondary-button disabled:opacity-60">
            {refreshing ? t('app.loading') : t('wantlist.refreshPrices')}
          </button>
        </div>
      </section>

      {accountUnavailable ? <div className="glass-panel p-4 text-sm text-amber-100">{t('collection.accountUnavailable')}</div> : null}
      {!discogsConfigured && !accountUnavailable ? <div className="glass-panel p-4 text-sm text-slate-300">{t('collection.configureAccount')}</div> : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label={t('wantlist.total')} value={summary.total} />
        <SummaryCard label={t('wantlist.priced')} value={summary.priced} tone="text-cyan-100" />
        <SummaryCard label={t('wantlist.targetHits')} value={summary.targetHits} tone="text-emerald-200" />
        <SummaryCard label={t('wantlist.unavailable')} value={summary.unavailable} tone="text-amber-100" />
        <SummaryCard label={t('wantlist.failed')} value={summary.failed} tone="text-rose-200" />
        <SummaryCard label={t('wantlist.pending')} value={summary.pending} tone="text-slate-300" />
      </div>

      <section className="glass-panel space-y-4 p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <form onSubmit={submitSearch} className="flex flex-1 gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('wantlist.searchPlaceholder')} className="w-full rounded-full border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-brand-300" />
            <button type="submit" className="secondary-button">{t('collection.search')}</button>
          </form>
          <select value={status} onChange={(event) => changeStatus(event.target.value)} className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none">
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3">Cover</th>
                <th className="px-4 py-3"><button type="button" onClick={() => handleSort('artist')}>Artist</button></th>
                <th className="px-4 py-3"><button type="button" onClick={() => handleSort('title')}>Title</button></th>
                <th className="px-4 py-3"><button type="button" onClick={() => handleSort('lowest_price_eur')}>{t('wantlist.lowestPrice')}</button></th>
                <th className="px-4 py-3">{t('wantlist.numForSale')}</th>
                <th className="px-4 py-3">{t('wantlist.targetPrice')}</th>
                <th className="px-4 py-3">{t('wantlist.lastChecked')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.items.map((item) => (
                <tr key={item.id} className={`border-t border-white/5 ${item.alert ? 'bg-emerald-400/10' : ''}`}>
                  <td className="px-4 py-3">
                    {item.cover_url ? <img src={item.cover_url} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="h-14 w-14 rounded-xl bg-white/5" />}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{item.artist}</td>
                  <td className="px-4 py-3"><Link to={`/release/${item.release_id}`} className="text-brand-100 hover:text-white">{item.title}</Link><div className="text-xs text-slate-500">{item.year || '-'}</div></td>
                  <td className="px-4 py-3 text-slate-200">{item.display_lowest_price == null ? '-' : formatCurrency(item.display_lowest_price, displayCurrency)}</td>
                  <td className="px-4 py-3 text-slate-300">{item.num_for_sale ?? '-'}</td>
                  <td className="px-4 py-3"><TargetEditor item={item} currency={displayCurrency} onSave={saveTarget} /></td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(item.last_price_checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && payload.items.length === 0 ? <p className="text-sm text-slate-400">{t('wantlist.empty')}</p> : null}

        <div className="flex items-center justify-between text-sm text-slate-400">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="secondary-button disabled:opacity-40">Prev</button>
          <span>{formatNumber(payload.pagination.page || 1)} / {formatNumber(payload.pagination.totalPages || 1)}</span>
          <button type="button" disabled={(payload.pagination.page || 1) >= (payload.pagination.totalPages || 1)} onClick={() => setPage((current) => current + 1)} className="secondary-button disabled:opacity-40">Next</button>
        </div>
      </section>
    </div>
  );
}

export default Wantlist;
```

- [ ] **Step 3: Add route and nav**

Modify `src/App.jsx`:

```js
import Wantlist from './pages/Wantlist';
```

Add nav link after Collection:

```jsx
<NavLink to="/wantlist" className={({ isActive }) => `nav-pill ${isActive ? 'nav-pill-active' : ''}`}>{t('nav.wantlist')}</NavLink>
```

Add route:

```jsx
<Route path="/wantlist" element={<Wantlist />} />
```

- [ ] **Step 4: Run tests and build**

```bash
npm test -- tests/i18n-columns.test.js tests/wantlist-contract.test.js
npm run build
```

Expected: tests pass and build completes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Wantlist.jsx src/App.jsx shared/i18n.js
git commit -m "feat: add wantlist page"
```

---

# Task 7: Documentation

**Files:**

- Modify: `README.md`
- Modify: `README.es.md`
- Modify: `CHANGELOG.md` and `CHANGELOG.en.md` if the project expects changelog entries before release.

- [ ] **Step 1: Update canonical README**

In `README.md`, add Wantlist to the feature list:

```md
- **Wantlist tracking** - sync your Discogs wantlist, monitor availability, set target prices, and spot buying opportunities.
```

Add a short section after sync setup:

```md
### Wantlist price alerts

After connecting your Discogs account, open **Wantlist** and click **Sync wantlist**. Discographic stores your wanted releases locally, checks current marketplace availability, and lets you set target prices. A target hit appears when the current lowest marketplace price is at or below your target.

Target prices are stored locally in your Discographic database. Discographic does not buy records for you and does not send external notifications in this version.
```

- [ ] **Step 2: Mirror Spanish README**

Add equivalent Spanish content to `README.es.md` in the same PR.

- [ ] **Step 3: Verify docs mention no secrets**

Search docs changes for accidental tokens:

```bash
rg -n "token=|Discogs token=|password|secret" README.md README.es.md CHANGELOG.md CHANGELOG.en.md
```

Expected: only generic setup/security language, no actual credentials.

- [ ] **Step 4: Commit**

```bash
git add README.md README.es.md CHANGELOG.md CHANGELOG.en.md
git commit -m "docs: document wantlist price alerts"
```

---

# Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: PASS. Existing Vite deprecation or chunk warnings may remain unless addressed by a separate improvement plan.

- [ ] **Step 3: Manual QA with test instance**

Start disposable instance:

```bash
npm run test:instance:start -- --host 127.0.0.1 --port 3801
```

Manual checks:

- Login as `admin-demo` / `demo12345`.
- Confirm Wantlist nav appears.
- Without Discogs token, Wantlist shows the account-configuration message.
- Configure a real Discogs account only in a secure local environment, never in docs or test files.
- Click Sync wantlist and verify rows appear.
- Set a target price above the current lowest price; row shows target-hit styling.
- Clear target; row no longer shows alert after reload.
- Refresh prices; summary updates.
- Switch display currency; displayed prices change while stored EUR comparisons remain stable.

Stop disposable instance:

```bash
npm run test:instance:stop -- --host 127.0.0.1 --port 3801
```

- [ ] **Step 4: Security review**

```bash
rg -n "Discogs token=|discogs_token|SESSION_SECRET|password_hash|demo12345" docs README.md README.es.md src server shared tests
```

Expected: only schema/code references and demo credentials already documented for disposable test instance; no real credentials.

- [ ] **Step 5: Final commit or PR**

```bash
git status --short
git log --oneline -5
```

Expected: only intended files changed. Open PR with summary:

```md
## Summary
- Add Wantlist sync and local storage
- Add marketplace price refresh and target-hit detection
- Add Wantlist page, navigation, and bilingual copy
- Add shared Wantlist contract and service tests

## Verification
- npm test
- npm run build
- Manual disposable instance QA
```

---

# Self-review checklist

- [ ] No code stores real Discogs tokens outside the existing account table.
- [ ] No docs or tests contain real credentials.
- [ ] Wantlist API uses `requireAuth`.
- [ ] Wantlist records are scoped by `user_id` in every SELECT/UPDATE/DELETE.
- [ ] Marketplace failures become `failed`, not fake zero prices.
- [ ] Target prices are compared in EUR internally.
- [ ] Display prices use the selected display currency.
- [ ] English and Spanish strings are both present.
- [ ] README canonical English change is mirrored in Spanish.
- [ ] Full `npm test` and `npm run build` pass before completion.
