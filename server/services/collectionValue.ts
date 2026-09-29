import type Database from 'better-sqlite3';

// Discogs' own collection valuation (`/users/{u}/collection/value`), based on recent sales.
// Values come back as display strings in the user's Discogs currency, e.g. "€7,335.94".

export type ParsedMoney = {
  amount: number;
  currency: string | null;
};

export type CollectionValueSnapshot = {
  date: string;
  currency: string | null;
  minimum: number | null;
  median: number | null;
  maximum: number | null;
};

// Longest prefixes first so "CA$" wins over "$".
const CURRENCY_PREFIXES: Array<[string, string]> = [
  ['CA$', 'CAD'],
  ['NZ$', 'NZD'],
  ['MX$', 'MXN'],
  ['A$', 'AUD'],
  ['R$', 'BRL'],
  ['CHF', 'CHF'],
  ['SEK', 'SEK'],
  ['ZAR', 'ZAR'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['$', 'USD'],
];

const SNAPSHOT_TABLE = 'collection_value_snapshots';

export function parseDiscogsMoney(value: unknown): ParsedMoney | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { amount: value, currency: null } : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const text = value.trim();
  const unsigned = text.replace(/^-/, '');
  const currency = CURRENCY_PREFIXES.find(([prefix]) => unsigned.startsWith(prefix) || text.endsWith(prefix))?.[1] ?? null;
  // Discogs formats these amounts with "," as thousands separator and "." for decimals.
  const amount = Number(text.replace(/[^\d.-]/g, ''));

  return Number.isFinite(amount) && /\d/.test(text) ? { amount, currency } : null;
}

export function migrateCollectionValueSnapshots(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
      user_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      currency TEXT,
      minimum REAL,
      median REAL,
      maximum REAL,
      taken_at TEXT NOT NULL,
      PRIMARY KEY (user_id, snapshot_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

/** Stores at most one snapshot per day; a later refresh on the same day replaces it. */
export function recordCollectionValue(
  db: Database.Database,
  userId: number,
  payload: unknown,
  now: Date = new Date(),
): CollectionValueSnapshot | null {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const minimum = parseDiscogsMoney(source.minimum);
  const median = parseDiscogsMoney(source.median);
  const maximum = parseDiscogsMoney(source.maximum);

  if (!minimum && !median && !maximum) {
    return null;
  }

  const snapshot: CollectionValueSnapshot = {
    date: now.toISOString().slice(0, 10),
    currency: median?.currency ?? minimum?.currency ?? maximum?.currency ?? null,
    minimum: minimum?.amount ?? null,
    median: median?.amount ?? null,
    maximum: maximum?.amount ?? null,
  };

  db.prepare(`
    INSERT INTO ${SNAPSHOT_TABLE} (user_id, snapshot_date, currency, minimum, median, maximum, taken_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
      currency = excluded.currency,
      minimum = excluded.minimum,
      median = excluded.median,
      maximum = excluded.maximum,
      taken_at = excluded.taken_at
  `).run(userId, snapshot.date, snapshot.currency, snapshot.minimum, snapshot.median, snapshot.maximum, now.toISOString());

  return snapshot;
}

export function getCollectionValueHistory(db: Database.Database, userId: number, limit = 365): CollectionValueSnapshot[] {
  return db.prepare<[number, number], CollectionValueSnapshot>(`
    SELECT snapshot_date AS date, currency, minimum, median, maximum
    FROM (
      SELECT * FROM ${SNAPSHOT_TABLE}
      WHERE user_id = ?
      ORDER BY snapshot_date DESC
      LIMIT ?
    )
    ORDER BY date ASC
  `).all(userId, limit);
}

export function clearCollectionValueSnapshots(db: Database.Database, userId: number): void {
  db.prepare(`DELETE FROM ${SNAPSHOT_TABLE} WHERE user_id = ?`).run(userId);
}
