import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { selectBestListings } from '../server/lib/inventory.js';

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
        listing_currency TEXT DEFAULT NULL,
        listing_price_eur REAL DEFAULT NULL,
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

  const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };

  function simulateInventorySync(userId, listings) {
    db.prepare('UPDATE releases SET listing_status = NULL, listing_price = NULL, listing_currency = NULL, listing_price_eur = NULL WHERE user_id = ?').run(userId);

    const listingMap = selectBestListings(listings, rates);

    const updateStmt = db.prepare('UPDATE releases SET listing_status = ?, listing_price = ?, listing_currency = ?, listing_price_eur = ? WHERE user_id = ? AND release_id = ?');
    const updateTx = db.transaction(() => {
      for (const [releaseId, listing] of listingMap) {
        updateStmt.run(listing.status, listing.price, listing.currency, listing.priceEur, userId, releaseId);
      }
    });
    updateTx();
  }

  it('marks listed items with status and price', () => {
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'For Sale', price: { value: 25.00, currency: 'USD' } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(25.00);
    expect(row.listing_currency).toBe('USD');
    expect(row.listing_price_eur).toBeCloseTo(22.73);
  });

  it('leaves non-listed items as NULL', () => {
    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1002').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
    expect(row.listing_currency).toBeNull();
    expect(row.listing_price_eur).toBeNull();
  });

  it('does not affect other users', () => {
    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 2 AND release_id = 1001').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
    expect(row.listing_currency).toBeNull();
    expect(row.listing_price_eur).toBeNull();
  });

  it('prefers For Sale over Draft for same release', () => {
    simulateInventorySync(1, [
      { release: { id: 1002 }, status: 'Draft', price: { value: 10.00, currency: 'GBP' } },
      { release: { id: 1002 }, status: 'For Sale', price: { value: 15.00, currency: 'USD' } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1002').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(15.00);
    expect(row.listing_currency).toBe('USD');
    expect(row.listing_price_eur).toBeCloseTo(13.64);
  });

  it('prefers lower price for same status', () => {
    simulateInventorySync(1, [
      { release: { id: 1003 }, status: 'For Sale', price: { value: 30.00, currency: 'USD' } },
      { release: { id: 1003 }, status: 'For Sale', price: { value: 20.00, currency: 'GBP' } },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1003').get();
    expect(row.listing_status).toBe('For Sale');
    expect(row.listing_price).toBeCloseTo(20.00);
    expect(row.listing_currency).toBe('GBP');
    expect(row.listing_price_eur).toBeCloseTo(23.53);
  });

  it('clears listing data when item is delisted', () => {
    // First sync: item is listed
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'For Sale', price: { value: 25.00, currency: 'USD' } },
    ]);
    let row = db.prepare('SELECT listing_status FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('For Sale');

    // Second sync: item no longer in inventory
    simulateInventorySync(1, []);
    row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBeNull();
    expect(row.listing_price).toBeNull();
    expect(row.listing_currency).toBeNull();
    expect(row.listing_price_eur).toBeNull();
  });

  it('handles listings with no price', () => {
    simulateInventorySync(1, [
      { release: { id: 1001 }, status: 'Draft', price: {} },
    ]);

    const row = db.prepare('SELECT listing_status, listing_price, listing_currency, listing_price_eur FROM releases WHERE user_id = 1 AND release_id = 1001').get();
    expect(row.listing_status).toBe('Draft');
    expect(row.listing_price).toBeNull();
    expect(row.listing_currency).toBeNull();
    expect(row.listing_price_eur).toBeNull();
  });
});
