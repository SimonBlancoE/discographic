import express from 'express';
import db, { normalizeNotes, setSettingForUser, stringifyJson } from '../db.js';
import { createUserStateStore } from '../lib/userStateStore.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { ensureCachedCover } from './media.js';
import { translate } from '../../shared/i18n.js';
import { DEFAULT_CURRENCY, convertAmountWithRates, getExchangeSnapshot } from '../services/exchangeRates.js';
import { ENRICH_CONDITION, getPendingEnrichmentCount, getPendingEnrichmentRows } from '../services/enrichmentQueue.js';
import { LISTING_STATUS, SYNC_PHASE, SYNC_STATUS } from '../../shared/progress.js';
import { SETTING_KEYS } from '../../shared/preferences.js';
import { selectBestListings } from '../lib/inventory.js';

const router = express.Router();
const PER_PAGE = 100;
const ENRICH_BATCH_SIZE = 30;

router.use(requireAuth);

function syncT(locale, key, vars) {
  return translate(locale || 'es', key, vars);
}

const syncStateStore = createUserStateStore((_userId, locale = 'es') => ({
  locale,
  status: SYNC_STATUS.IDLE,
  current: 0,
  total: 0,
  phase: SYNC_PHASE.IDLE,
  message: syncT(locale, 'backend.sync.idle'),
  startedAt: null,
  finishedAt: null,
  recordsSynced: 0,
  enrichment: null,
  thumbnails: null
}));

const getSyncState = (userId, locale = 'es') => syncStateStore.get(userId, locale);
const setSyncState = (userId, patch) => syncStateStore.patch(userId, patch);

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
    labels, country, cover_url, rating, notes, date_added, estimated_value,
    tracklist, folder_id, raw_json, synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
    folder_id = excluded.folder_id,
    raw_json = excluded.raw_json,
    synced_at = CURRENT_TIMESTAMP
`);

const upsertBatch = db.transaction((userId, items) => {
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
    phase: SYNC_PHASE.DOWNLOADING,
    total: totalItems,
    current: 0,
    message: syncT(locale, 'backend.sync.downloading', { items: totalItems, pages: totalPages })
  });

  let totalSynced = 0;

  for (let page = 1; page <= totalPages; page += 1) {
    const payload = page === 1 ? firstPage : await discogs.getCollection(page, PER_PAGE);
    const releases = payload.releases || [];

    if (releases.length > 0) {
      upsertBatch(userId, releases);
      totalSynced += releases.length;
    }

    setSyncState(userId, {
      current: totalSynced,
      message: syncT(locale, 'backend.sync.page', { page, pages: totalPages, count: totalSynced })
    });
  }

  try {
    const value = await discogs.getCollectionValue();
    if (value?.maximum) {
      setSettingForUser(userId, SETTING_KEYS.COLLECTION_VALUE, value.maximum);
    } else if (value?.median) {
      setSettingForUser(userId, SETTING_KEYS.COLLECTION_VALUE, value.median);
    }
  } catch (error) {
    console.error('[sync] failed to fetch collection value:', error.message);
  }

  setSettingForUser(userId, SETTING_KEYS.LAST_SYNC_AT, new Date().toISOString());

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
    status: SYNC_STATUS.COMPLETED,
    phase: SYNC_PHASE.READY,
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
      status: SYNC_STATUS.IDLE,
      current: 0,
      total: 0,
      message: syncT(locale, 'backend.sync.warmReady')
    }
  });

  await syncInventory({ userId, discogs }).catch((error) => {
    console.error('[sync] inventory sync failed:', error.message);
    setSyncState(userId, {
      inventory: {
        status: SYNC_STATUS.FAILED,
        message: syncT(locale, 'backend.sync.inventoryFail', { error: error.message })
      }
    });
  });

  warmupThumbnails(userId).catch((error) => {
    setSyncState(userId, {
      thumbnails: {
        status: SYNC_STATUS.FAILED,
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

    const listingMap = selectBestListings(allListings, exchangeSnapshot.rates);

    const updateStmt = db.prepare('UPDATE releases SET listing_status = ?, listing_price = ?, listing_currency = ?, listing_price_eur = ? WHERE user_id = ? AND release_id = ?');
    const updateTx = db.transaction(() => {
      for (const [releaseId, listing] of listingMap) {
        updateStmt.run(listing.status, listing.price, listing.currency, listing.priceEur, userId, releaseId);
      }
    });
    updateTx();
  } catch (error) {
    console.error('[inventory-sync] error:', error.message);
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
          status: SYNC_STATUS.IDLE,
          current: 0,
          total: 0,
          message: syncT(locale, 'backend.sync.noCovers')
        }
      });
      return;
    }

    setSyncState(userId, {
      thumbnails: {
        status: SYNC_STATUS.RUNNING,
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
          status: SYNC_STATUS.RUNNING,
          current: processed,
          total: rows.length,
          message: syncT(locale, 'backend.sync.thumbPreparing', { current: processed, total: rows.length })
        }
      });
    }

    setSyncState(userId, {
      thumbnails: {
        status: SYNC_STATUS.COMPLETED,
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
        enrichment: { status: SYNC_STATUS.IDLE, pending: 0, current: 0, total: 0, message: syncT(locale, 'backend.sync.completeSet') }
      });
      return;
    }

    let processed = 0;
    setSyncState(userId, {
      enrichment: { status: SYNC_STATUS.RUNNING, pending: totalPending, current: 0, total: totalPending, message: syncT(locale, 'backend.sync.enrichProgress', { current: 0, total: totalPending }) }
    });

    for (let offset = 0; offset < pendingRows.length && enrichRunning.has(userId); offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);
      for (const row of rows) {
        if (!enrichRunning.has(userId)) break;

        try {
          const detail = await discogs.getRelease(row.release_id);
          const stats = await discogs.getMarketplaceStats(row.release_id, DEFAULT_CURRENCY).catch(() => null);
          const priceEur = stats?.lowest_price?.value ?? 0;

          db.prepare(`
            UPDATE releases
            SET estimated_value = ?,
                country = COALESCE(?, country),
                tracklist = CASE WHEN tracklist IS NULL OR tracklist = '[]' THEN ? ELSE tracklist END,
                synced_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
          `).run(
            priceEur,
            detail.country || null,
            stringifyJson(detail.tracklist || []),
            row.id,
            userId
          );
        } catch (error) {
          console.error('[enrich] error:', row.release_id, error.message);
        }

        processed += 1;
        const remaining = totalPending - processed;
        setSyncState(userId, {
          enrichment: {
            status: SYNC_STATUS.RUNNING,
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
        status: SYNC_STATUS.COMPLETED,
        pending: finalPending,
        current: processed,
        total: totalPending,
        message: finalPending
          ? syncT(locale, 'backend.sync.enrichRemaining', { processed, pending: finalPending })
          : syncT(locale, 'backend.sync.enrichDone', { processed })
      }
    });
  } catch (error) {
    console.error('[enrich] fatal error:', error.message);
    setSyncState(userId, {
      enrichment: { status: SYNC_STATUS.FAILED, pending: 0, current: 0, total: 0, message: error.message }
    });
  } finally {
    enrichRunning.delete(userId);
  }
}

router.post('/', async (req, res) => {
  const userId = req.session.userId;
  const state = getSyncState(userId, req.locale);

  if (state.status === SYNC_STATUS.RUNNING) {
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
      status: SYNC_STATUS.RUNNING,
      current: 0,
      total: 0,
      phase: SYNC_PHASE.INITIALIZING,
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
        status: SYNC_STATUS.FAILED,
        phase: SYNC_PHASE.ERROR,
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
      console.error('[enrich] background error:', error.message);
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
    'SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND estimated_value IS NULL'
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
