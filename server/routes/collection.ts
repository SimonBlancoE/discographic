import type { ReleaseRow } from '../db.js';
import { errorMessage } from '../services/errors.js';
import express, { type Request } from 'express';
import { record } from '../discogsPagination.js';
import { withCollectionWriter } from '../services/collectionWriters.js';
import { acceptIndividualEdit, pendingRevision } from '../services/pendingImportEdits.js';
import { createUserJobScope } from '../services/userJobs.js';
import db, { getCollectionFieldMap, getCollectionFolders, getSettingForUser, hasStoredCollectionFieldMap, hydrateRelease, parseJson, setCollectionFieldMap, setCollectionFolders, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { DEFAULT_CURRENCY, convertAmountWithRates, convertReleasePrices, getExchangeSnapshot, normalizeCurrency } from '../services/exchangeRates.js';
import { MARKETPLACE_STATUS } from '../../shared/contracts/marketplace.js';
import {
  normalizeCollectionRelease,
  normalizeRandomRelease,
  normalizeReleaseDetail,
  normalizeWallRelease
} from '../../shared/contracts/release.js';
import { fetchMarketplaceValue } from '../services/marketplaceValue.js';
import { getNoteFieldText, parseStoredNotes } from '../services/notes.js';
import { buildCommunityUpdate } from '../services/communityStats.js';
import { getMasterVersionsForRelease } from '../services/masterVersions.js';
import { getPriceSuggestions } from '../services/priceSuggestions.js';
import { buildReleaseFilterWhere, getCollectionFilterOptions } from '../services/releaseFilters.js';

const router = express.Router();

// All handlers below run after requireAuth verifies userId and the current auth epoch.
router.use(requireAuth);

const BASE_FIELDS = `
  id,
  user_id,
  release_id,
  instance_id,
  title,
  artist,
  year,
  genres,
  styles,
  formats,
  labels,
  country,
  cover_url,
  rating,
  notes,
  date_added,
  estimated_value,
  marketplace_status,
  listing_status,
  listing_price,
  listing_currency,
  listing_price_eur,
  tracklist,
  folder_id,
  raw_json,
  master_id,
  community_have,
  community_want,
  community_rating,
  community_rating_count,
  num_for_sale,
  synced_at
`;

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getFilterOptions(userId: number) {
  const fieldMap = getCollectionFieldMap(userId);
  const options = getCollectionFilterOptions(db, userId, {
    folders: getCollectionFolders(userId),
    mediaFieldId: fieldMap.mediaFieldId
  });
  const gradeOrder = (value: string) => {
    const index = fieldMap.mediaOptions.indexOf(value);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  options.conditions.sort((a, b) => gradeOrder(a) - gradeOrder(b) || a.localeCompare(b));
  return options;
}

function getDisplayCurrency(req: Request) {
  return normalizeCurrency(req.query.currency || getSettingForUser(req.session.userId!, 'currency', DEFAULT_CURRENCY));
}

async function convertHydratedRelease(req: Request, release: ReleaseRow, normalizeRelease: (value: unknown) => unknown = normalizeCollectionRelease) {
  const converted = await convertReleasePrices(hydrateRelease(release), getDisplayCurrency(req));
  return normalizeRelease(converted);
}

async function enrichReleaseIfNeeded(req: Request, release: ReleaseRow) {
  const scope = createUserJobScope(req.session.userId!);
  if (!release) {
    return null;
  }

  // Only fetch detail if we've never enriched this release before.
  // tracklist stays '[]' until we call /releases/:id for the first time.
  const neverEnriched = !release.tracklist || release.tracklist === '[]';
  if (!neverEnriched && release.community_have != null) {
    return convertHydratedRelease(req, release, normalizeReleaseDetail);
  }

  let discogs;
  try {
    discogs = getDiscogsClientForUser(req);
  } catch {
    return convertHydratedRelease(req, release, normalizeReleaseDetail);
  }

  try {
    const detail = record(await discogs.getRelease(release.release_id));
    if (!detail) throw new Error('Invalid Discogs release response');
    scope.assertCurrent();
    // Releases that already have a price only needed the community stats backfill.
    const marketplace = neverEnriched || release.marketplace_status !== MARKETPLACE_STATUS.PRICED
      ? await fetchMarketplaceValue(discogs, release.release_id, DEFAULT_CURRENCY)
      : { marketplaceStatus: release.marketplace_status, estimatedValue: release.estimated_value };

    scope.assertCurrent();
    const estimatedValue = marketplace.marketplaceStatus === MARKETPLACE_STATUS.PRICED
      ? marketplace.estimatedValue
      : null;
    const community = buildCommunityUpdate(detail);

    db.prepare(`
      UPDATE releases
      SET genres = ?,
          styles = ?,
          country = ?,
          tracklist = ?,
          estimated_value = ?,
          marketplace_status = ?,
          raw_json = ?,
          master_id = COALESCE(?, master_id),
          community_have = ?,
          community_want = ?,
          community_rating = ?,
          community_rating_count = ?,
          num_for_sale = ?,
          synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      stringifyJson(detail.genres || parseJson(release.genres, [])),
      stringifyJson(detail.styles || parseJson(release.styles, [])),
      detail.country || release.country || null,
      stringifyJson(detail.tracklist || []),
      estimatedValue,
      marketplace.marketplaceStatus,
      JSON.stringify(detail),
      community.master_id,
      community.community_have ?? 0,
      community.community_want ?? 0,
      community.community_rating,
      community.community_rating_count,
      community.num_for_sale,
      release.id,
      req.session.userId!
    );

    const fresh = db.prepare<unknown[], ReleaseRow>(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(release.id, req.session.userId!)!;
    return convertHydratedRelease(req, fresh, normalizeReleaseDetail);
  } catch (error) {
    scope.assertCurrent();
    console.error(`[enrich] Failed to fetch release details for release ${release.release_id} from Discogs:`, errorMessage(error));
    return convertHydratedRelease(req, release, normalizeReleaseDetail);
  }
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 25));
    const offset = (page - 1) * limit;
    const validSort = new Set(['artist', 'title', 'year', 'rating', 'date_added', 'estimated_value', 'listing_price_eur', 'community_want', 'community_have']);
    const sortBy = typeof req.query.sortBy === 'string' && validSort.has(req.query.sortBy) ? req.query.sortBy : 'artist';
    const sortOrder = String(req.query.sortOrder || 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const { clause, params } = buildReleaseFilterWhere({
      userId,
      filters: req.query,
      mediaFieldId: getCollectionFieldMap(userId).mediaFieldId
    });

    const total = db.prepare<unknown[], { count: number }>(`SELECT COUNT(*) AS count FROM releases ${clause}`).get(...params)!.count;
    const rawReleases = db.prepare<unknown[], ReleaseRow>(`
      SELECT ${BASE_FIELDS}
      FROM releases
      ${clause}
      ORDER BY ${sortBy} IS NULL, ${sortBy} ${sortOrder}, artist ASC, title ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const releases = await Promise.all(rawReleases.map((release) => convertHydratedRelease(req, release)));

    res.json({
      releases,
      displayCurrency: getDisplayCurrency(req),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      filters: getFilterOptions(userId)
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

router.get('/random', async (req, res) => {
  try {
    const release = db.prepare<unknown[], ReleaseRow>(`
      SELECT ${BASE_FIELDS}
      FROM releases
      WHERE user_id = ?
      ORDER BY RANDOM()
      LIMIT 1
    `).get(req.session.userId!);

    if (!release) {
      return res.status(404).json({ error: req.t('backend.collection.empty') });
    }

    const converted = await convertHydratedRelease(req, release, normalizeRandomRelease);

    return res.json(converted);
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

router.get('/covers', (req, res) => {
  try {
    const releases = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'release_id' | 'title' | 'artist' | 'year' | 'genres' | 'styles' | 'formats' | 'labels' | 'cover_url'>>(`
      SELECT id, release_id, title, artist, year, genres, styles, formats, labels, cover_url
      FROM releases
      WHERE user_id = ?
      ORDER BY date_added DESC, artist ASC, title ASC
    `).all(req.session.userId!).map((release) => normalizeWallRelease(hydrateRelease(release)));

    return res.json({ releases, filters: getFilterOptions(req.session.userId!) });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

// Field definitions are normally stored by the Discogs sync run. Right after upgrading there is no
// stored map yet, and accounts with renamed/recreated fields would otherwise edit the wrong field ids.
async function ensureCollectionMetadata(req: Request) {
  const scope = createUserJobScope(req.session.userId!);
  const userId = req.session.userId!;
  if (hasStoredCollectionFieldMap(userId)) {
    return;
  }

  try {
    const discogs = getDiscogsClientForUser(req);
    const [fields, folders] = await Promise.all([discogs.getCustomFields(), discogs.getCollectionFolders()]);
    scope.assertCurrent();
    if (fields) setCollectionFieldMap(userId, fields);
    if (folders) setCollectionFolders(userId, folders);
  } catch (error) {
    console.log('[collection] could not load Discogs field definitions:', errorMessage(error));
  }
}

router.get('/meta', async (req, res) => {
  await ensureCollectionMetadata(req);
  const fieldMap = getCollectionFieldMap(req.session.userId!);
  res.json({
    folders: getCollectionFolders(req.session.userId!),
    mediaConditions: fieldMap.mediaFieldId ? fieldMap.mediaOptions : [],
    sleeveConditions: fieldMap.sleeveFieldId ? fieldMap.sleeveOptions : []
  });
});

router.get('/:id/versions', async (req, res) => {
  try {
    const release = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'release_id' | 'master_id'>>('SELECT id, release_id, master_id FROM releases WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId!);

    if (!release) {
      return res.status(404).json({ error: req.t('backend.collection.notFound') });
    }

    if (!release.master_id) {
      return res.json({ masterId: null, total: 0, versions: [] });
    }

    const discogs = getDiscogsClientForUser(req);
    return res.json(await getMasterVersionsForRelease({ db, discogs, userId: req.session.userId!, release: { ...release, master_id: release.master_id } }));
  } catch (error) {
    return res.status(502).json({ error: errorMessage(error) });
  }
});

router.get('/:id/price-suggestions', async (req, res) => {
  try {
    const release = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'release_id'>>('SELECT id, release_id FROM releases WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.session.userId!);

    if (!release) {
      return res.status(404).json({ error: req.t('backend.collection.notFound') });
    }

    const displayCurrency = getDisplayCurrency(req);
    const discogs = getDiscogsClientForUser(req);
    return res.json(await getPriceSuggestions({
      discogs,
      userId: req.session.userId!,
      releaseId: release.release_id,
      convert: async (amount, fromCurrency) => {
        try {
          const { rates } = await getExchangeSnapshot([fromCurrency, displayCurrency]);
          // Price suggestions supply finite positive amounts; missing rates throw above.
          return { amount: convertAmountWithRates(amount, fromCurrency, displayCurrency, rates)!, currency: displayCurrency };
        } catch {
          return { amount, currency: fromCurrency };
        }
      }
    }));
  } catch (error) {
    return res.status(502).json({ error: errorMessage(error) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const release = db.prepare<unknown[], ReleaseRow>(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(req.params.id, req.session.userId!);

    if (!release) {
      return res.status(404).json({ error: req.t('backend.collection.notFound') });
    }

    const hydrated = await enrichReleaseIfNeeded(req, release);
    return res.json(hydrated);
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

router.put('/:id', async (req, res) => {
  const body = record(req.body) ?? {};
  const scope = createUserJobScope(req.session.userId!);
  try {
    const initialRelease = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'user_id' | 'release_id' | 'instance_id' | 'folder_id' | 'notes' | 'rating'>>(`
      SELECT id, user_id, release_id, instance_id, folder_id, notes, rating
      FROM releases
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.session.userId!);

    if (!initialRelease) {
      return res.status(404).json({ error: req.t('backend.collection.notFound') });
    }

    return await withCollectionWriter(req.session.userId!, initialRelease.instance_id, scope, async () => {
      // Another writer may have moved or edited the instance while this request waited.
      const release = db.prepare<unknown[], ReleaseRow>('SELECT * FROM releases WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId!);
      if (!release) return res.status(404).json({ error: req.t('backend.collection.notFound') });
      const revisions = new Map(db.prepare<unknown[], { field_id: number; revision: string }>('SELECT field_id, revision FROM pending_import_edits WHERE user_id = ? AND instance_id = ?')
        .all(req.session.userId!, release.instance_id).map(row => [row.field_id, row.revision]));
      const revisionFor = (fieldId: number) => revisions.get(fieldId) ?? null;
      const stillCurrent = (fieldId: number) => pendingRevision(db, req.session.userId!, release.instance_id, fieldId) === revisionFor(fieldId);
      const nextRating = body.rating !== undefined ? Number(body.rating) : release.rating;
      if (body.rating !== undefined && !(nextRating != null && Number.isInteger(nextRating) && nextRating >= 0 && nextRating <= 5)) {
        return res.status(400).json({ error: req.t('backend.collection.invalidRating') });
      }

      await ensureCollectionMetadata(req);
      scope.assertCurrent();
      const fieldMap = getCollectionFieldMap(req.session.userId!);
      const conditionEdits = ([
        ['media_condition', fieldMap.mediaFieldId, fieldMap.mediaOptions],
        ['sleeve_condition', fieldMap.sleeveFieldId, fieldMap.sleeveOptions]
      ] satisfies [string, number | null, string[]][]).filter(([key]) => body[key] !== undefined);

      for (const [key, fieldId, options] of conditionEdits) {
        const value = String(body[key] ?? '').trim();
        if (!fieldId || (value && !options.includes(value))) {
          return res.status(400).json({ error: req.t('backend.collection.invalidCondition') });
        }
      }

      let targetFolderId: number | null = null;
      if (body.folder_id !== undefined) {
        targetFolderId = Number(body.folder_id);
        const knownFolder = getCollectionFolders(req.session.userId!).some((folder) => folder.id === targetFolderId);
        if (!knownFolder) {
          return res.status(400).json({ error: req.t('backend.collection.invalidFolder') });
        }
      }

      const discogs = getDiscogsClientForUser(req);
      const userId = req.session.userId!;
      const base = {
        folderId: release.folder_id || 0,
        releaseId: release.release_id,
        instanceId: release.instance_id
      };

      // Preserve partial success, but an import confirmed during an upstream await wins
      // over this older individual operation. Every accepted field settles atomically.
      const readNotes = () => parseStoredNotes(
        db.prepare<unknown[], Pick<ReleaseRow, 'notes'>>('SELECT notes FROM releases WHERE id = ? AND user_id = ?').get(release.id, userId)?.notes
      );
      const fieldEdits: [number, string][] = [
        ...(body.notes !== undefined ? [[fieldMap.notesFieldId, String(body.notes || '').trim()] as [number, string]] : []),
        ...conditionEdits.map(([key, fieldId]): [number, string] => [fieldId!, String(body[key] ?? '').trim()])
      ];

      try {
        if (body.rating !== undefined && nextRating != null && nextRating !== release.rating && stillCurrent(0)) {
          await discogs.updateRating({ ...base, rating: nextRating }, { signal: scope.signal });
          scope.assertCurrent();
          acceptIndividualEdit(db, userId, release.instance_id, 0, revisionFor(0), nextRating);
        }

        // Only the fields that actually changed are written back to Discogs.
        for (const [fieldId, value] of fieldEdits) {
          if (!stillCurrent(fieldId) || value === getNoteFieldText(readNotes(), fieldId)) {
            continue;
          }

          await discogs.updateField({ ...base, fieldId, value }, { signal: scope.signal });
          scope.assertCurrent();
          acceptIndividualEdit(db, userId, release.instance_id, fieldId, revisionFor(fieldId), value);
        }

        if (targetFolderId != null && targetFolderId !== (release.folder_id || 0)) {
          await discogs.moveToFolder({ ...base, targetFolderId }, { signal: scope.signal });
          scope.assertCurrent();
          db.prepare('UPDATE releases SET folder_id = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(targetFolderId, release.id, userId);
        }
      } catch (error) {
        // 502: Discogs rejected a write. The client reloads the release to show what was actually saved.
        return res.status(502).json({ error: errorMessage(error) });
      }

      const updated = db.prepare<unknown[], ReleaseRow>(`SELECT ${BASE_FIELDS} FROM releases WHERE id = ? AND user_id = ?`).get(req.params.id, req.session.userId!)!;
      const converted = await convertHydratedRelease(req, updated, normalizeReleaseDetail);
      return res.json(converted);
    });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) });
  }
});

export default router;
