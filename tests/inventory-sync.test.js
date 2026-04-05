import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDbPath = join(__dirname, '.test-inventory.db');

describe('Inventory sync logic', () => {
  let db;

  beforeAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        release_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        listing_status TEXT DEFAULT NULL,
        listing_price REAL DEFAULT NULL,
        UNIQUE(user_id, instance_id)
      )
    `);

    // Seed collection
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 1001, 1, 'Album A', 'Artist A')`).run();
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 1002, 2, 'Album B', 'Artist B')`).run();
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (1, 1003, 3, 'Album C', 'Artist C')`).run();
    db.prepare(`INSERT INTO releases (user_id, release_id, instance_id, title, artist) VALUES (2, 1001, 4, 'Album A', 'Artist A')`).run();
  });

  afterAll(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  function simulateInventorySync(userId, listings) {
    // Clear existing listing data (same as the real sync)
    db.prepare('UPDATE releases SET listing_status = NULL, listing_price = NULL WHERE user_id = ?').run(userId);

    // Build map of release_id -> best listing
    const listingMap = new Map();
    for (const listing of listings) {
      const releaseId = listing.release?.id;
      if (!releaseId) continue;

      const entry = {
        status: listing.status || 'For Sale',
        price: listing.price?.value ? Number(listing.price.value) : null,
      };

      const existing = listingMap.get(releaseId);
      if (!existing) {
        listingMap.set(releaseId, entry);
      } else {
        const statusRank = (s) => (s === 'For Sale' ? 0 : 1);
        if (statusRank(entry.status) < statusRank(existing.status) ||
            (entry.status === existing.status && entry.price != null && (existing.price == null || entry.price < existing.price))) {
          listingMap.set(releaseId, entry);
        }
      }
    }

    const updateStmt = db.prepare('UPDATE releases SET listing_status = ?, listing_price = ? WHERE user_id = ? AND release_id = ?');
    const updateTx = db.transaction(() => {
      for (const [releaseId, listing] of listingMap) {
        updateStmt.run(listing.status, listing.price, userId, releaseId);
      }
    });
    updateTx();
  }

  it('marks listed items with status and price', () => {
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'For Sale', price: { value: 25.00 } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(25.00);
  });

  it('leaves non-listed items as NULL', () => {
    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1002').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
  });

  it('does not affect other users', () => {
    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 2 AND release_id = 1001').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
  });

  it('prefers For Sale over Draft for same release', () => {
    simulateInventorySync(1, [
      { release: { id: 1002 }, status: 'Draft', price: { value: 10.00 } },
      { release: { id: 1002 }, status: 'For Sale', price: { value: 15.00 } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1002').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(15.00);
  });

  it('prefers lower price for same status', () => {
    simulateInventorySync(1, [
      { release: { id: 1003 }, status: 'For Sale', price: { value: 30.00 } },
      { release: { id: 1003 }, status: 'For Sale', price: { value: 20.00 } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1003').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(20.00);
  });

  it('clears listing data when item is delisted', () => {
    // First sync: item is listed
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'For Sale', price: { value: 25.00 } },
    ]);
    let row = db.prepare('SELECT listing_status FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('For Sale');

    // Second sync: item no longer in inventory
    simulateInventorySync(1, []);
    row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
  });

  it('handles listings with no price', () => {
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'Draft', price: {} },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('Draft');
    expect(row.listing_price).toBeNull();
  });
});
