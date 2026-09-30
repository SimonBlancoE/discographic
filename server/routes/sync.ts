import type { DiscogsClient } from '../discogs.js';
import type { UserJobScope } from '../services/userJobs.js';
import type { TranslationVars } from '../../shared/i18n.js';
import type { SyncStatusState, ProgressWorkflow, EnrichmentWorkflow } from '../../shared/contracts/syncStatus.js';
import { record } from '../discogsPagination.js';

import type { ReleaseRow } from '../db.js';
import { errorMessage } from '../services/errors.js';
import express from 'express';
import db, { normalizeNotes, setCollectionFieldMap, setCollectionFolders, stringifyJson } from '../db.js';
import { createUserJobScope, registerUserJobCanceller } from '../services/userJobs.js';
import { recordCollectionValue } from '../services/collectionValue.js';
import { buildCommunityUpdate, getCommunityBackfillCount, getCommunityBackfillRows } from '../services/communityStats.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { ensureCachedCover, removeCachedCovers } from '../services/coverMedia.js';
import { translate } from '../../shared/i18n.js';
import { DEFAULT_CURRENCY, convertAmountWithRates, getExchangeSnapshot } from '../services/exchangeRates.js';
import { pruneUnseenReleases } from '../services/collectionReconcile.js';
import { ENRICH_CONDITION, getPendingEnrichmentCount, getPendingEnrichmentRows } from '../services/enrichmentQueue.js';
import { MARKETPLACE_STATUS } from '../../shared/contracts/marketplace.js';
import { normalizeSyncStatus } from '../../shared/contracts/syncStatus.js';
import { fetchMarketplaceValue } from '../services/marketplaceValue.js';
import { fetchCompleteInventory } from '../discogsInventory.js';
import { overlayPendingImportEdits, markMissingPendingInstances } from '../services/pendingImportEdits.js';
import { fetchCompleteCollection } from '../discogsCollection.js';

type SyncProgress = Omit<SyncStatusState, 'progressPercent' | 'isRunning' | 'isTerminal' | 'enrichment' | 'thumbnails' | 'inventory'> & {
  enrichment: Partial<EnrichmentWorkflow> | null;
  thumbnails: Partial<ProgressWorkflow> | null;
  inventory?: Partial<ProgressWorkflow> | null;
  community?: Partial<ProgressWorkflow>;
};
type RunRegistry = Map<number, UserJobScope>;
type RunInput = { userId: number; discogs: DiscogsClient; run: UserJobScope };

const router = express.Router();
const PER_PAGE = 100;
const ENRICH_BATCH_SIZE = 30;
const syncStates = new Map<number, SyncProgress>();
// One token per running job so a stop + restart cannot leave two loops alive for the same user.
const syncRuns: RunRegistry = new Map();
const enrichRuns: RunRegistry = new Map();
const communityRuns: RunRegistry = new Map();

function startRun(registry: RunRegistry, userId: number) {
  registry.get(userId)?.cancel();
  const run = createUserJobScope(userId);
  registry.set(userId, run);
  return run;
}

function stopRun(registry: RunRegistry, userId: number) {
  const run = registry.get(userId);
  if (run) {
    run.cancel();
  }
  registry.delete(userId);
}

function finishRun(registry: RunRegistry, userId: number, run: UserJobScope) {
  if (registry.get(userId) === run) {
    registry.delete(userId);
  }
}

registerUserJobCanceller((userId) => {
  stopRun(syncRuns, userId);
  stopRun(enrichRuns, userId);
  stopRun(communityRuns, userId);
  syncStates.delete(userId);
});

// All handlers below run after requireAuth verifies userId and the current auth epoch.
router.use(requireAuth);

function syncT(locale: string, key: string, vars?: TranslationVars) {
  return translate(locale || 'es', key, vars);
}

function getSyncState(userId: number, locale = 'es') {
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

  return syncStates.get(userId)!;
}

function setSyncState(userId: number, patch: Partial<SyncProgress>) {
  syncStates.set(userId, {
    ...getSyncState(userId),
    ...patch
  });
}

function mapCollectionItem(item: Awaited<ReturnType<typeof fetchCompleteCollection>>[number]) {
  const info = item.basic_information;
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
    master_id: info.master_id || null,
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
    tracklist, folder_id, raw_json, master_id, synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, instance_id) DO UPDATE SET
    release_id = excluded.release_id,
    title = excluded.title,
    artist = excluded.artist,
    year = excluded.year,
    genres = excluded.genres,
    styles = excluded.styles,
    formats = excluded.formats,
    labels = excluded.labels,
    country = COALESCE(excluded.country, releases.country),
    master_id = COALESCE(excluded.master_id, releases.master_id),
    cover_url = excluded.cover_url,
    rating = excluded.rating,
    notes = excluded.notes,
    date_added = excluded.date_added,
    last_seen_sync_id = excluded.last_seen_sync_id,
    folder_id = excluded.folder_id,
    raw_json = excluded.raw_json,
    synced_at = CURRENT_TIMESTAMP
`);

const upsertBatch = db.transaction((userId: number, syncId: number, items: Awaited<ReturnType<typeof fetchCompleteCollection>>) => {
  for (const item of items) {
    const mapped = mapCollectionItem(item);
    Object.assign(mapped, overlayPendingImportEdits(db, userId, mapped.instance_id, mapped));
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
      mapped.raw_json,
      mapped.master_id
    );
  }
});

async function syncCollectionMetadata({ userId, discogs, run }: RunInput) {
  // Field definitions (condition grading, notes) and folders: one request each per sync.
  const [fields, folders] = await Promise.allSettled([
    discogs.getCustomFields({ signal: run.signal }),
    discogs.getCollectionFolders({ signal: run.signal })
  ]);

  if (run.stopped) return;

  if (fields.status === 'fulfilled' && fields.value) {
    setCollectionFieldMap(userId, fields.value);
  } else if (fields.status === 'rejected') {
    console.log('[sync] collection fields unavailable:', fields.reason?.message);
  }

  // One valuation snapshot per sync builds the value history chart over time.
  try {
    const value = await discogs.getCollectionValue({ signal: run.signal });
    if (run.stopped) return;
    recordCollectionValue(db, userId, value);
  } catch (error) {
    console.log('[sync] collection value unavailable:', errorMessage(error));
  }

  if (run.stopped) return;

  if (folders.status === 'fulfilled' && folders.value) {
    setCollectionFolders(userId, folders.value);
  } else if (folders.status === 'rejected') {
    console.log('[sync] collection folders unavailable:', folders.reason?.message);
  }
}

async function runSync({ userId, logId, discogs, locale, run }: RunInput & { logId: number; locale: string }) {
  const releases = await fetchCompleteCollection(async (page, perPage) => {
    run.assertCurrent();
    const payload = await discogs.getCollection(page, perPage, { signal: run.signal });
    run.assertCurrent();
    return payload;
  }, PER_PAGE, ({ page, pages, items, current }) => {
    run.assertCurrent();
    setSyncState(userId, {
      locale,
      phase: 'downloading',
      total: items,
      current,
      message: syncT(locale, 'backend.sync.page', { page, pages, count: current })
    });
  });
  if (run.stopped || syncRuns.get(userId) !== run) return;

  // Apply only after the complete snapshot has coherent metadata and unique instance coverage.
  // Download progress counts observed rows; recordsSynced counts committed Local collection rows.
  const totalItems = releases.length;
  upsertBatch(userId, logId, releases);
  const totalSynced = releases.length;
  setSyncState(userId, { recordsSynced: totalSynced });

  await syncCollectionMetadata({ userId, discogs, run });
  if (run.stopped) {
    return;
  }

  // Snapshot validation proves observable page/identity coverage, not remote atomicity while
  // the user's collection changes on Discogs. Only a validated snapshot reaches reconciliation.
  const removedReleaseIds = pruneUnseenReleases(db, userId, logId);
  markMissingPendingInstances(db, userId);
  if (removedReleaseIds.length) {
    await removeCachedCovers({ userId, releaseIds: removedReleaseIds }).catch((error) => {
      console.log('[sync] cache cleanup failed:', errorMessage(error));
    });
  }

  // A run cancelled by an account reset must not report into the state of whatever runs next.
  if (run.stopped) {
    return;
  }

  db.prepare('UPDATE sync_log SET records_synced = ? WHERE id = ? AND user_id = ?')
    .run(totalSynced, logId, userId);

  const pending = db.prepare<unknown[], { count: number }>(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(userId)!.count;

  setSyncState(userId, {
    phase: 'inventory',
    current: totalSynced,
    total: totalItems,
    recordsSynced: totalSynced,
    message: syncT(locale, 'backend.sync.inventoryPreparing'),
    enrichment: {
      pending,
      message: pending
        ? syncT(locale, 'backend.sync.pending', { count: pending })
        : syncT(locale, 'backend.sync.completeSet')
    },
    inventory: { status: 'running', message: syncT(locale, 'backend.sync.inventoryPreparing') }
  });

  try {
    await syncInventory({ userId, discogs, run });
  } catch (error) {
    if (run.stopped) return;
    const message = syncT(locale, 'backend.sync.inventoryFail', { error: errorMessage(error) });
    setSyncState(userId, { inventory: { status: 'failed', message } });
    throw new Error(message);
  }
  if (run.stopped) return;

  setSyncState(userId, {
    phase: 'thumbnails',
    message: syncT(locale, 'backend.sync.thumbStarting'),
    inventory: { status: 'completed', message: syncT(locale, 'backend.sync.inventoryDone') }
  });
  await warmupThumbnails(userId, run);

  // Only the current owner may finalize the whole Discogs sync run.
  if (run.stopped || syncRuns.get(userId) !== run) return;
  db.prepare(`
    UPDATE sync_log
    SET finished_at = CURRENT_TIMESTAMP,
        records_synced = ?,
        status = 'completed'
    WHERE id = ? AND user_id = ?
  `).run(totalSynced, logId, userId);
  setSyncState(userId, {
    status: 'completed',
    phase: 'ready',
    message: syncT(locale, 'backend.sync.completed', { count: totalSynced }),
    finishedAt: new Date().toISOString()
  });
}

async function syncInventory({ userId, discogs, run }: RunInput) {
  try {
    const allListings = await fetchCompleteInventory(async (page, perPage) => {
      if (run.stopped) throw new Error('Inventory sync cancelled');
      const payload = await discogs.getInventory(page, perPage, { signal: run.signal });
      if (run.stopped) throw new Error('Inventory sync cancelled');
      return payload;
    }, PER_PAGE);
    if (run.stopped) return;

    const clearListings = db.prepare('UPDATE releases SET listing_status = NULL, listing_price = NULL, listing_currency = NULL, listing_price_eur = NULL WHERE user_id = ?');
    if (!allListings.length) {
      clearListings.run(userId);
      return;
    }

    const exchangeSnapshot = await getExchangeSnapshot(
      allListings.map((listing) => listing.price?.currency).filter(Boolean)
    );

    if (run.stopped) return;

    // Build a map of release_id -> best listing (prefer "For Sale" over 'Draft', lowest price)
    const listingMap = new Map<number, { status: string; price: number | null; currency: string | null; priceEur: number | null }>();
    for (const listing of allListings) {
      const releaseId = listing.release?.id;
      if (!releaseId) continue;

      const originalCurrency = (listing.price?.currency || DEFAULT_CURRENCY).toUpperCase();
      const originalPrice = listing.price?.value ?? null;
      const priceEur = originalPrice == null || !exchangeSnapshot.rates?.[originalCurrency]
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
        // Prefer "For Sale" over 'Draft'; among same status, prefer lower price
        const statusRank = (s: string) => (s === 'For Sale' ? 0 : 1);
        if (statusRank(entry.status) < statusRank(existing.status) ||
            (entry.status === existing.status && entry.priceEur != null && (existing.priceEur == null || entry.priceEur < existing.priceEur))) {
          listingMap.set(releaseId, entry);
        }
      }
    }

    // Update releases that match
    const updateStmt = db.prepare('UPDATE releases SET listing_status = ?, listing_price = ?, listing_currency = ?, listing_price_eur = ? WHERE user_id = ? AND release_id = ?');
    // Listings are replaced atomically so a failed fetch never leaves the collection looking delisted.
    const updateTx = db.transaction(() => {
      clearListings.run(userId);
      for (const [releaseId, listing] of listingMap) {
        updateStmt.run(listing.status, listing.price, listing.currency, listing.priceEur, userId, releaseId);
      }
    });
    updateTx();
  } catch (error) {
    console.log('[inventory-sync] error:', errorMessage(error));
    throw error;
  }
}

async function warmupThumbnails(userId: number, run: UserJobScope) {
  const { locale = 'es' } = getSyncState(userId);
  const rows = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'cover_url'>>(`
    SELECT id, cover_url
    FROM releases
    WHERE user_id = ? AND cover_url IS NOT NULL AND cover_url != ''
    ORDER BY date_added DESC, id DESC
    LIMIT 240
  `).all(userId);

  if (!rows.length) {
    setSyncState(userId, {
      thumbnails: {
        status: 'completed',
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
  let failed = 0;
  for (const release of rows) {
    try {
      if (run.stopped) return;
      await ensureCachedCover({ release, userId, variant: 'wall', scope: run });
      if (run.stopped) return;
      await ensureCachedCover({ release, userId, variant: 'poster', scope: run });
    } catch {
      if (run.stopped) return;
      failed += 1;
      // Continue preparing the remaining covers, then report the partial failure.
    }

    if (run.stopped) return;
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

  if (failed) {
    const message = syncT(locale, 'backend.sync.thumbPartial', { failed, total: rows.length });
    setSyncState(userId, { thumbnails: { status: 'failed', current: processed, total: rows.length, message } });
    throw new Error(message);
  }

  setSyncState(userId, {
    thumbnails: {
      status: 'completed',
      current: rows.length,
      total: rows.length,
      message: syncT(locale, 'backend.sync.thumbDone')
    }
  });
}

const updateEnrichedRelease = db.prepare(`
  UPDATE releases
  SET estimated_value = ?,
      marketplace_status = ?,
      country = COALESCE(?, country),
      tracklist = CASE WHEN tracklist IS NULL OR tracklist = '[]' THEN ? ELSE tracklist END,
      master_id = COALESCE(?, master_id),
      community_have = ?,
      community_want = ?,
      community_rating = ?,
      community_rating_count = ?,
      num_for_sale = ?,
      synced_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`);

async function runEnrichAll({ userId, discogs, run }: RunInput) {
  const { locale = 'es' } = getSyncState(userId);

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

    for (let offset = 0; offset < pendingRows.length && !run.stopped; offset += ENRICH_BATCH_SIZE) {
      const rows = pendingRows.slice(offset, offset + ENRICH_BATCH_SIZE);
      for (const row of rows) {
        if (run.stopped) break;

        try {
          const detail = record(await discogs.getRelease(row.release_id, { signal: run.signal }));
          if (run.stopped) return;
          const marketplace = await fetchMarketplaceValue(discogs, row.release_id, DEFAULT_CURRENCY, { signal: run.signal });
          if (run.stopped) return;

          const estimatedValue = marketplace.marketplaceStatus === MARKETPLACE_STATUS.PRICED
            ? marketplace.estimatedValue
            : null;

          const community = buildCommunityUpdate(detail);
          updateEnrichedRelease.run(
            estimatedValue,
            marketplace.marketplaceStatus,
            detail?.country || null,
            stringifyJson(detail?.tracklist || []),
            community.master_id,
            community.community_have,
            community.community_want,
            community.community_rating,
            community.community_rating_count,
            community.num_for_sale,
            row.id,
            userId
          );
        } catch (error) {
          console.log('[enrich] error:', row.release_id, errorMessage(error));
        }

        if (run.stopped) return;
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

    // A newer run owns the status once this one has been stopped and replaced.
    if (run.stopped) {
      return;
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
    if (run.stopped) return;
    console.log('[enrich] error fatal:', errorMessage(error));
    setSyncState(userId, {
      enrichment: { status: 'failed', pending: 0, current: 0, total: 0, message: errorMessage(error) }
    });
  } finally {
    finishRun(enrichRuns, userId, run);
  }
}

const updateCommunity = db.prepare(`
  UPDATE releases
  SET master_id = COALESCE(?, master_id),
      community_have = ?,
      community_want = ?,
      community_rating = ?,
      community_rating_count = ?,
      num_for_sale = ?,
      country = COALESCE(?, country)
  WHERE id = ? AND user_id = ?
`);

function getCommunityState(userId: number) {
  return getSyncState(userId).community || { status: 'idle', current: 0, total: 0 };
}

async function runCommunityRefresh({ userId, discogs, run }: RunInput) {
  const rows = getCommunityBackfillRows(db, userId);
  let processed = 0;
  setSyncState(userId, { community: { status: 'running', current: 0, total: rows.length } });

  try {
    for (const row of rows) {
      if (run.stopped) break;

      try {
        const detail = record(await discogs.getRelease(row.release_id, { signal: run.signal }));
        if (run.stopped) return;
        const community = buildCommunityUpdate(detail);
        updateCommunity.run(
          community.master_id,
          // 0 marks "fetched, nobody has it" so the row leaves the backfill queue.
          community.community_have ?? 0,
          community.community_want ?? 0,
          community.community_rating,
          community.community_rating_count,
          community.num_for_sale,
          detail?.country || null,
          row.id,
          userId
        );
      } catch (error) {
        console.log('[community] error:', row.release_id, errorMessage(error));
      }

      if (run.stopped) return;
      processed += 1;
      setSyncState(userId, { community: { status: 'running', current: processed, total: rows.length } });
    }

    if (run.stopped) {
      return;
    }

    setSyncState(userId, { community: { status: 'completed', current: processed, total: rows.length } });
  } catch (error) {
    if (run.stopped) return;
    setSyncState(userId, { community: { status: 'failed', current: processed, total: rows.length, message: errorMessage(error) } });
  } finally {
    finishRun(communityRuns, userId, run);
  }
}


router.post('/', async (req, res) => {
  const userId = req.session.userId!;
  if (syncRuns.has(userId)) {
    return res.status(409).json({ error: req.t('backend.sync.active') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    const logId = Number(db.prepare(`
      INSERT INTO sync_log (user_id, started_at, status, records_synced)
      VALUES (?, CURRENT_TIMESTAMP, 'running', 0)
    `).run(userId).lastInsertRowid);

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
      thumbnails: null,
      inventory: null
    });

    const run = startRun(syncRuns, userId);
    res.json({ ok: true });

    runSync({ userId, logId, discogs, locale: req.locale, run }).catch((error) => {
      if (run.stopped || syncRuns.get(userId) !== run) return;
      db.prepare(`
        UPDATE sync_log
        SET finished_at = CURRENT_TIMESTAMP,
            status = 'failed',
            records_synced = ?
        WHERE id = ? AND user_id = ?
      `).run(getSyncState(userId).recordsSynced, logId, userId);

      setSyncState(userId, {
        status: 'failed',
        phase: 'error',
        recordsSynced: getSyncState(userId).recordsSynced,
        message: errorMessage(error),
        finishedAt: new Date().toISOString()
      });
    }).finally(() => {
      finishRun(syncRuns, userId, run);
    });
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error) });
  }
});

router.post('/enrich', async (req, res) => {
  const userId = req.session.userId!;

  if (enrichRuns.has(userId)) {
    return res.status(409).json({ error: req.t('backend.sync.activeEnrich') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    const run = startRun(enrichRuns, userId);
    res.json({ ok: true });

    runEnrichAll({ userId, discogs, run }).catch((error) => {
      console.log('[enrich] background error:', errorMessage(error));
    });
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error) });
  }
});

router.post('/enrich/stop', (req, res) => {
  const userId = req.session.userId!;
  stopRun(enrichRuns, userId);
  const state = getSyncState(userId);
  const enrichment = state.enrichment;
  if (enrichment?.status === 'running') {
    const pending = getPendingEnrichmentCount(db, userId);
    setSyncState(userId, { enrichment: {
      ...enrichment, status: 'completed', pending,
      message: syncT(state.locale, 'backend.sync.enrichRemaining', { processed: enrichment.current, pending })
    } });
  }
  res.json({ ok: true });
});

router.get('/community', (req, res) => {
  const userId = req.session.userId!;
  res.json({
    ...getCommunityState(userId),
    running: communityRuns.has(userId),
    pending: getCommunityBackfillCount(db, userId)
  });
});

router.post('/community', (req, res) => {
  const userId = req.session.userId!;
  if (communityRuns.has(userId)) {
    return res.status(409).json({ error: req.t('backend.sync.activeCommunity') });
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    const run = startRun(communityRuns, userId);
    res.json({ ok: true });

    runCommunityRefresh({ userId, discogs, run }).catch((error) => {
      console.log('[community] background error:', errorMessage(error));
    });
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error) });
  }
});

router.post('/community/stop', (req, res) => {
  const userId = req.session.userId!;
  stopRun(communityRuns, userId);
  const community = getCommunityState(userId);
  if (community.status === 'running') {
    setSyncState(userId, { community: { ...community, status: 'completed' } });
  }
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const state = getSyncState(req.session.userId!, req.locale);
  const pending = db.prepare<unknown[], { count: number }>(
    `SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND (${ENRICH_CONDITION})`
  ).get(req.session.userId!)!.count;

  res.json(normalizeSyncStatus({
    ...state,
    // The idle message is created once per user; re-translate it so it follows the viewer's language.
    ...(state.status === 'idle' ? { message: req.t('backend.sync.idle') } : {}),
    enrichment: {
      ...state.enrichment,
      pending
    },
    thumbnails: state.thumbnails,
    inventory: state.inventory
  }));
});

export default router;
