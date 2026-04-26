import express from 'express';
import db, { normalizeNotes, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { ensureCachedCover, removeCachedCovers } from '../services/coverMedia.js';
import { translate } from '../../shared/i18n.js';
import { DEFAULT_CURRENCY, convertAmountWithRates, getExchangeSnapshot } from '../services/exchangeRates.js';
import { pruneUnseenReleases } from '../services/collectionReconcile.js';
import { ENRICH_CONDITION, getPendingEnrichmentCount, getPendingEnrichmentRows } from '../services/enrichmentQueue.js';
import { fetchMarketplaceValue, MARKETPLACE_STATUS } from '../services/marketplaceValue.js';

const router = express.Router();
const PER_PAGE = 100;
const ENRICH_BATCH_SIZE = 30;
const syncStates = new Map();

router.use(requireAuth);

function syncT(locale, key, vars) {
  return translate(locale || 'es', key, vars);
}

function getSyncState(userId, locale = 'es') {
  if (!syncStates.has(userId)) {
    syncStates.set(userId, {
      locale,
      status: 'idle',
      current: 0,
      total: 0,
      phase: 'idle',
      message: syncT(locale, 'backend.sync.idle'),
      startedAt: null,
      finishedAt: null,
      recordsSynced: 0,
      enrichment: null,
      thumbnails: null
    });
  }

  return syncStates.get(userId);
}

function setSyncState(userId, patch) {
  syncStates.set(userId, {
    ...getSyncState(userId),
    ...patch
  });
}

function mapCollectionItem(item) {
  const info = item.basic_information || {};
  return {
    release_id: info.id,
    instance_id: item.instance_id,
    title: info.title || 'Sin titulo',
    artist: (info.artists || []).map((artist) => artist.name).join(', ') || 'Artista desconocido',
    year: info.year || null,
    genres: stringifyJson(info.genres || []),
    styles: stringifyJson(info.styles || []),
    formats: stringifyJson(info.formats || []),
    labels: stringifyJson(info.labels || []),
    country: null,
    cover_url: info.cover_image || info.thumb || null,
    rating: item.rating || 0,
    notes: stringifyJson(normalizeNotes(item.notes)),
    date_added: item.date_added || null,
    folder_id: item.folder_id || 0,
    raw_json: JSON.stringify(item)
  };
}

const upsertStmt = db.prepare(`
  INSERT INTO releases (
    user_id, release_id, instance_id, title, artist, year, genres, styles, formats,
    labels, country, cover_url, rating, notes, date_added, estimated_value, marketplace_status, last_seen_sync_id,
    tracklist, folder_id, raw_json, synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, instance_id) DO UPDATE SET
    release_id = excluded.release_id,
    title = excluded.title,
    artist = excluded.artist,
    year = excluded.year,
    genres = excluded.genres,
    styles = excluded.styles,
    formats = excluded.formats,
    labels = excluded.labels,
    country = excluded.country,
    cover_url = excluded.cover_url,
    rating = excluded.rating,
    notes = excluded.notes,
    date_added = excluded.date_added,
    last_seen_sync_id = excluded.last_seen_sync_id,
    folder_id = excluded.folder_id,
    raw_json = excluded.raw_json,
    synced_at = CURRENT_TIMESTAMP
`);

const upsertBatch = db.transaction((userId, syncId, items) => {
  for (const item of items) {
    const mapped = mapCollectionItem(item);
    upsertStmt.run(
      userId,
      mapped.release_id,
      mapped.instance_id,
      mapped.title,
      mapped.artist,
      mapped.year,
      mapped.genres,
      mapped.styles,
      mapped.formats,
      mapped.labels,
      mapped.country,
      mapped.cover_url,
      mapped.rating,
      mapped.notes,
      mapped.date_added,
      null,
      MARKETPLACE_STATUS.PENDING,
      syncId,
      '[]',
      mapped.folder_id,
      mapped.raw_json
    );
  }
});

async function runSync({ userId, logId, discogs, locale }) {
  const firstPage = await discogs.getCollection(1, PER_PAGE);
  const totalPages = firstPage?.pagination?.pages || 0;
  const totalItems = firstPage?.pagination?.items || 0;

  setSyncState(userId, {
    locale,
    phase: 'downloading',
    total: totalItems,
    current: 0,
    message: syncT(locale, 'backend.sync.downloading', { items: totalItems, pages: totalPages })
  });

  let totalSynced = 0;

  for (let page = 1; page <= totalPages; page += 1) {
    const payload = page === 1 ? firstPage : await discogs.getCollection(page, PER_PAGE);
    const releases = payload.releases || [];

    if (releases.length > 0) {
      upsertBatch(userId, logId, releases);
      totalSynced += releases.length;
    }

    setSyncState(userId, {
      current: totalSynced,
      message: syncT(locale, 'backend.sync.page', { page, pages: totalPages, count: totalSynced })
    });
  }

  // Reconciliation assumes this is a successful full collection sync.
  // If sync is ever made partial/incremental in the future, do not prune
  // unseen rows here unless the run can still prove complete coverage.
  const removedReleaseIds = pruneUnseenReleases(db, userId, logId);
  if (removedReleaseIds.length) {
    await removeCachedCovers({ userId, releaseIds: removedReleaseIds }).catch((error) => {
      console.log('[sync] cache cleanup failed:', error.message);
    });
  }

  db.prepare(`
    UPDATE sync_log
    SET finished_at = CURRENT_TIMESTAMP,
        records_synced = ?,
        status = 'completed'
    WHERE id = ? AND user_id = ?
  `).run(totalSynced, logId, userId);

  const pending = db.prepare(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(userId).count;

  setSyncState(userId, {
    status: 'completed',
    phase: 'ready',
    current: totalSynced,
    total: totalItems,
    message: syncT(locale, 'backend.sync.completed', { count: totalSynced }),
    finishedAt: new Date().toISOString(),
    recordsSynced: totalSynced,
    enrichment: {
      pending,
      message: pending
        ? syncT(locale, 'backend.sync.pending', { count: pending })
        : syncT(locale, 'backend.sync.completeSet')
    },
    thumbnails: {
      status: 'idle',
      current: 0,
      total: 0,
      message: syncT(locale, 'backend.sync.warmReady')
    }
  });

  await syncInventory({ userId, discogs }).catch((error) => {
    console.log('[sync] inventory sync failed:', error.message);
    setSyncState(userId, {
      inventory: {
        status: 'failed',
        message: syncT(locale, 'backend.sync.inventoryFail', { error: error.message })
      }
    });
  });

  warmupThumbnails(userId).catch((error) => {
    setSyncState(userId, {
      thumbnails: {
        status: 'failed',
        current: 0,
        total: 0,
        message: syncT(locale, 'backend.sync.thumbFail', { error: error.message })
      }
    });
  });
}

async function syncInventory({ userId, discogs }) {
  try {
    // Clear existing listing data — items may have been delisted
    db.prepare('UPDATE releases SET listing_status = NULL, listing_price = NULL, listing_currency = NULL, listing_price_eur = NULL WHERE user_id = ?').run(userId);

    // Fetch all pages of the user's inventory
    const firstPage = await discogs.getInventory(1, 100);
    const totalPages = firstPage?.pagination?.pages || 0;
    const allListings = [...(firstPage?.listings || [])];

    for (let page = 2; page <= totalPages; page += 1) {
      const payload = await discogs.getInventory(page, 100);
      allListings.push(...(payload?.listings || []));
    }

    if (!allListings.length) return;

    const exchangeSnapshot = await getExchangeSnapshot(
      allListings.map((listing) => listing.price?.currency).filter(Boolean)
    );

    // Build a map of release_id -> best listing (prefer "For Sale" over "Draft", lowest price)
    const listingMap = new Map();
    for (const listing of allListings) {
      const releaseId = listing.release?.id;
      if (!releaseId) continue;

      const originalCurrency = (listing.price?.currency || DEFAULT_CURRENCY).toUpperCase();
      const originalPrice = listing.price?.value != null ? Number(listing.price.value) : null;
      const priceEur = originalPrice == null
        ? null
        : convertAmountWithRates(originalPrice, originalCurrency, DEFAULT_CURRENCY, exchangeSnapshot.rates);

      const entry = {
        status: listing.status || 'For Sale',
        price: originalPrice,
        currency: originalPrice == null ? null : originalCurrency,
        priceEur,
      };

      const existing = listingMap.get(releaseId);
      if (!existing) {
        listingMap.set(releaseId, entry);
      } else {
        // Prefer "For Sale" over "Draft"; among same status, prefer lower price
        const statusRank = (s) => (s === 'For Sale' ? 0 : 1);
        if (statusRank(entry.status) < statusRank(existing.status) ||
            (entry.status === existing.status && entry.priceEur != null && (existing.priceEur == null || entry.priceEur < existing.priceEur))) {
          listingMap.set(releaseId, entry);
        }
      }
    }

    // Update releases that match
    const updateStmt = db.prepare('UPDATE releases SET listing_status = ?, listing_price = ?, listing_currency = ?, listing_price_eur = ? WHERE user_id = ? AND release_id = ?');
    const updateTx = db.transaction(() => {
      for (const [releaseId, listing] of listingMap) {
        updateStmt.run(listing.status, listing.price, listing.currency, listing.priceEur, userId, releaseId);
      }
    });
    updateTx();
  } catch (error) {
    console.log('[inventory-sync] error:', error.message);
    throw error;
  }
}

const thumbnailWarmupRunning = new Set();

async function warmupThumbnails(userId) {
  const { locale = 'es' } = getSyncState(userId);
  if (thumbnailWarmupRunning.has(userId)) {
    return;
  }

  thumbnailWarmupRunning.add(userId);

  try {
    const rows = db.prepare(`
      SELECT id, cover_url
      FROM releases
      WHERE user_id = ? AND cover_url IS NOT NULL AND cover_url != ''
      ORDER BY date_added DESC, id DESC
      LIMIT 240
    `).all(userId);

    if (!rows.length) {
      setSyncState(userId, {
        thumbnails: {
          status: 'idle',
          current: 0,
          total: 0,
          message: syncT(locale, 'backend.sync.noCovers')
        }
      });
      return;
    }

    setSyncState(userId, {
      thumbnails: {
        status: 'running',
        current: 0,
        total: rows.length,
        message: syncT(locale, 'backend.sync.thumbPreparing', { current: 0, total: rows.length })
      }
    });

    let processed = 0;
    for (const release of rows) {
      try {
        await ensureCachedCover({ release, userId, variant: 'wall' });
        await ensureCachedCover({ release, userId, variant: 'poster' });
      } catch {
        // continue warming remaining covers
      }

      processed += 1;
      setSyncState(userId, {
        thumbnails: {
          status: 'running',
          current: processed,
          total: rows.length,
          message: syncT(locale, 'backend.sync.thumbPreparing', { current: processed, total: rows.length })
        }
      });
    }

    setSyncState(userId, {
      thumbnails: {
        status: 'completed',
        current: rows.length,
        total: rows.length,
        message: syncT(locale, 'backend.sync.thumbDone')
      }
    });
  } finally {
    thumbnailWarmupRunning.delete(userId);
  }
}

const enrichRunning = new Set();

async function runEnrichAll({ userId, discogs }) {
  const { locale = 'es' } = getSyncState(userId);
  if (enrichRunning.has(userId)) {
    return;
  }

  enrichRunning.add(userId);

  try {
    const pendingRows = getPendingEnrichmentRows(db, userId);
    const totalPending = pendingRows.length;

    if (!totalPending) {
      setSyncState(userId, {
        enrichment: { status: 'idle', pending: 0, current: 0, total: 0, message: syncT(locale, 'backend.sync.completeSet') }
      });
      return;
    }

    let processed = 0;
    setSyncState(userId, {
      enrichment: { status: 'running', pending: totalPending, current: 0, total: totalPending, message: syncT(locale, 'backend.sync.enrichProgress', { current: 0, total: totalPending }) }
    });

    for (let offset = 0; offset < pendingRows.length && enrichRunning.has(userId); offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);
      for (const row of rows) {
        if (!enrichRunning.has(userId)) break;

        try {
          const detail = await discogs.getRelease(row.release_id);
          const marketplace = await fetchMarketplaceValue(discogs, row.release_id, DEFAULT_CURRENCY);

          db.prepare(`
            UPDATE releases
            SET estimated_value = ?,
                marketplace_status = ?,
                country = COALESCE(?, country),
                tracklist = CASE WHEN tracklist IS NULL OR tracklist = '[]' THEN ? ELSE tracklist END,
                synced_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
          `).run(
            marketplace.estimatedValue,
            marketplace.marketplaceStatus,
            detail.country || null,
            stringifyJson(detail.tracklist || []),
            row.id,
            userId
          );
        } catch (error) {
          console.log('[enrich] error:', row.release_id, error.message);
        }

        processed += 1;
        const remaining = totalPending - processed;
        setSyncState(userId, {
          enrichment: {
            status: 'running',
            pending: remaining,
            current: processed,
            total: totalPending,
            message: syncT(locale, 'backend.sync.enrichProgress', { current: processed, total: totalPending })
          }
        });
      }
    }

    const finalPending = getPendingEnrichmentCount(db, userId);

    setSyncState(userId, {
      enrichment: {
        status: 'completed',
        pending: finalPending,
        current: processed,
        total: totalPending,
        message: finalPending
          ? syncT(locale, 'backend.sync.enrichRemaining', { processed, pending: finalPending })
          : syncT(locale, 'backend.sync.enrichDone', { processed })
      }
    });
  } catch (error) {
    console.log('[enrich] error fatal:', error.message);
    setSyncState(userId, {
      enrichment: { status: 'failed', pending: 0, current: 0, total: 0, message: error.message }
    });
  } finally {
    enrichRunning.delete(userId);
  }
}


router.post('/', async (req, res) => {
  const userId = req.session.userId;
  const state = getSyncState(userId, req.locale);

  if (state.status === 'running') {
    return res.status(409).json({ error: req.t('backend.sync.active') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    const logId = db.prepare(`
      INSERT INTO sync_log (user_id, started_at, status, records_synced)
      VALUES (?, CURRENT_TIMESTAMP, 'running', 0)
    `).run(userId).lastInsertRowid;

    setSyncState(userId, {
      locale: req.locale,
      status: 'running',
      current: 0,
      total: 0,
      phase: 'initializing',
      message: req.t('backend.sync.initializing'),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      recordsSynced: 0,
      enrichment: null,
      thumbnails: null
    });

    res.json({ ok: true });

    runSync({ userId, logId, discogs, locale: req.locale }).catch((error) => {
      db.prepare(`
        UPDATE sync_log
        SET finished_at = CURRENT_TIMESTAMP,
            status = 'failed'
        WHERE id = ? AND user_id = ?
      `).run(logId, userId);

      setSyncState(userId, {
        status: 'failed',
        phase: 'error',
        message: error.message,
        finishedAt: new Date().toISOString()
      });
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/enrich', async (req, res) => {
  const userId = req.session.userId;

  if (enrichRunning.has(userId)) {
    return res.status(409).json({ error: req.t('backend.sync.activeEnrich') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    res.json({ ok: true });

    runEnrichAll({ userId, discogs }).catch((error) => {
      console.log('[enrich] background error:', error.message);
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/enrich/stop', (req, res) => {
  enrichRunning.delete(req.session.userId);
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const state = getSyncState(req.session.userId, req.locale);
  const pending = db.prepare(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(req.session.userId).count;

  res.json({
    ...state,
    enrichment: {
      ...state.enrichment,
      pending
    },
    thumbnails: state.thumbnails
  });
});

export default router;
