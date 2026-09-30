import { parseJsonArray } from '../services/jsonStorage.js';
import { record } from '../discogsPagination.js';
import type { ReleaseRow } from '../db.js';
import { errorMessage } from '../services/errors.js';
import express from 'express';
import db, { getCollectionFieldMap, getCollectionFolders, getRadarForUser, getSettingForUser } from '../db.js';
import { DEFAULT_CURRENCY, convertAmount, convertAmountWithRates, getExchangeSnapshot, normalizeCurrency } from '../services/exchangeRates.js';
import { getCollectionValueHistory, recordCollectionValue } from '../services/collectionValue.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { normalizeDashboardStats } from '../../shared/contracts/dashboardStats.js';
import { MARKETPLACE_STATUS } from '../../shared/contracts/marketplace.js';
import { RADAR_PRIORITY } from '../../shared/contracts/radar.js';

type CountRow = { count: number };
type NamedCount = CountRow & { name: string };
type JsonValueRow = { value: string | null };

const router = express.Router();

// All handlers below run after requireAuth verifies userId and the current auth epoch.
router.use(requireAuth);

function countJsonValues(rows: JsonValueRow[], mapValue: (value: unknown) => unknown) {
  const counts = new Map<unknown, number>();

  for (const row of rows) {
    const entries = parseJsonArray(row.value);
    for (const entry of entries) {
      const name = mapValue(entry);
      if (!name) {
        continue;
      }
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

function buildRadarDashboardSummary(radar: ReturnType<typeof getRadarForUser>) {
  const items = Array.isArray(radar?.items) ? radar.items : [];
  const summary = {
    totalWanted: Number(radar?.summary?.total) || 0,
    activeOpportunities: 0,
    belowTarget: 0,
    alreadyOwned: 0
  };

  for (const item of items) {
    const opportunity = item?.opportunity;
    const local = item?.local;

    if (!opportunity?.default_visible) {
      continue;
    }

    summary.activeOpportunities += 1;
    if (local?.priority === RADAR_PRIORITY.HIGH) {
      summary.belowTarget += 1;
    }

    if (opportunity.is_in_collection) {
      summary.alreadyOwned += 1;
    }
  }

  return summary;
}

const NOTES_ARRAY = "CASE WHEN json_valid(notes) THEN notes ELSE '[]' END";
const COMMUNITY_FIELDS = 'id, artist, title, year, community_have AS have, community_want AS want, community_rating AS rating';

function countFieldValues(userId: number, fieldId: number | null) {
  if (!fieldId) {
    return [];
  }

  return db.prepare<unknown[], NamedCount>(`
    SELECT COALESCE(field.value, '') AS name, COUNT(*) AS count
    FROM releases
    LEFT JOIN (
      SELECT releases.id AS release_row, json_extract(entry.value, '$.value') AS value
      FROM releases, json_each(${NOTES_ARRAY}) AS entry
      WHERE releases.user_id = ? AND CAST(json_extract(entry.value, '$.field_id') AS INTEGER) = ?
    ) AS field ON field.release_row = releases.id
    WHERE releases.user_id = ?
    GROUP BY name
  `).all(userId, fieldId, userId);
}

function buildCommunitySummary(userId: number) {
  const covered = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND community_have IS NOT NULL').get(userId)!.count;
  const pending = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND community_have IS NULL').get(userId)!.count;

  return {
    covered,
    pending,
    mostWanted: db.prepare(`
      SELECT ${COMMUNITY_FIELDS} FROM releases
      WHERE user_id = ? AND community_want > 0
      ORDER BY community_want DESC, artist ASC
      LIMIT 8
    `).all(userId),
    rarest: db.prepare(`
      SELECT ${COMMUNITY_FIELDS} FROM releases
      WHERE user_id = ? AND community_have > 0
      ORDER BY community_have ASC, community_want DESC
      LIMIT 8
    `).all(userId),
    // Wanted by more people than own it: the records collectors are hunting.
    hotRatio: db.prepare(`
      SELECT ${COMMUNITY_FIELDS} FROM releases
      WHERE user_id = ? AND community_have > 0 AND community_want >= 5
      ORDER BY CAST(community_want AS REAL) / community_have DESC, community_want DESC
      LIMIT 8
    `).all(userId)
  };
}

async function buildCollectionValue(userId: number, displayCurrency: string) {
  const history = getCollectionValueHistory(db, userId);
  if (!history.length) {
    return { currency: null, history: [] };
  }

  const sourceCurrencies = [...new Set(history.map((point) => point.currency).filter(Boolean))];
  try {
    const { rates } = await getExchangeSnapshot([...sourceCurrencies, displayCurrency]);
    const convert = (amount: number | null, currency: string | null) => convertAmountWithRates(amount, currency || displayCurrency, displayCurrency, rates);
    return {
      currency: displayCurrency,
      history: history.map((point) => ({
        date: point.date,
        minimum: convert(point.minimum, point.currency),
        median: convert(point.median, point.currency),
        maximum: convert(point.maximum, point.currency)
      }))
    };
  } catch {
    // No exchange rate for the Discogs currency: show the values as Discogs reported them.
    return { currency: history[history.length - 1].currency, history };
  }
}

router.post('/collection-value', async (req, res) => {
  try {
    const snapshot = recordCollectionValue(db, req.session.userId!, await getDiscogsClientForUser(req).getCollectionValue());
    if (!snapshot) {
      return res.status(502).json({ error: req.t('backend.stats.collectionValueUnavailable') });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(502).json({ error: errorMessage(error) });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const displayCurrency = normalizeCurrency(req.query.currency || getSettingForUser(userId, 'currency', DEFAULT_CURRENCY));
    const radar = getRadarForUser(userId);
    const totalRecords = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ?').get(userId)!.count;
    const ratedRecords = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND rating > 0').get(userId)!.count;
    const fieldMap = getCollectionFieldMap(userId);
    // Only the Notes field counts: condition grades live in the same array but are not notes.
    const notesRecords = db.prepare<unknown[], CountRow>(`
      SELECT COUNT(*) AS count
      FROM releases
      WHERE user_id = ? AND EXISTS (
        SELECT 1 FROM json_each(${NOTES_ARRAY}) AS entry
        WHERE CAST(json_extract(entry.value, '$.field_id') AS INTEGER) = ?
          AND TRIM(COALESCE(json_extract(entry.value, '$.value'), '')) != ''
      )
    `).get(userId, fieldMap.notesFieldId)!.count;
    const pricedRecords = db.prepare<unknown[], CountRow>(`
      SELECT COUNT(*) AS count
      FROM releases
      WHERE user_id = ? AND marketplace_status = ? AND estimated_value IS NOT NULL AND estimated_value > 0
    `).get(userId, MARKETPLACE_STATUS.PRICED)!.count;
    const valuePendingRecords = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND marketplace_status = ?').get(userId, MARKETPLACE_STATUS.PENDING)!.count;
    const valueFailedRecords = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND marketplace_status = ?').get(userId, MARKETPLACE_STATUS.FAILED)!.count;
    const valueUnavailableRecords = db.prepare<unknown[], CountRow>('SELECT COUNT(*) AS count FROM releases WHERE user_id = ? AND marketplace_status = ?').get(userId, MARKETPLACE_STATUS.UNAVAILABLE)!.count;
    const totalValueEur = db.prepare<unknown[], { total: number }>(`
      SELECT COALESCE(SUM(estimated_value), 0) AS total
      FROM releases
      WHERE user_id = ? AND marketplace_status = ? AND estimated_value IS NOT NULL AND estimated_value > 0
    `).get(userId, MARKETPLACE_STATUS.PRICED)!.total;

    const genres = countJsonValues(
      db.prepare<unknown[], JsonValueRow>('SELECT genres AS value FROM releases WHERE user_id = ? AND genres IS NOT NULL').all(userId),
      (entry) => entry
    );

    const formats = countJsonValues(
      db.prepare<unknown[], JsonValueRow>('SELECT formats AS value FROM releases WHERE user_id = ? AND formats IS NOT NULL').all(userId),
      (entry) => record(entry)?.name || entry
    );

    const labels = countJsonValues(
      db.prepare<unknown[], JsonValueRow>('SELECT labels AS value FROM releases WHERE user_id = ? AND labels IS NOT NULL').all(userId),
      (entry) => record(entry)?.name || entry
    ).slice(0, 20);

    const decades = db.prepare(`
      SELECT printf('%ds', (CAST(year / 10 AS INTEGER) * 10)) AS name, COUNT(*) AS count
      FROM releases
      WHERE user_id = ? AND year IS NOT NULL AND year > 0
      GROUP BY CAST(year / 10 AS INTEGER)
      ORDER BY CAST(year / 10 AS INTEGER)
    `).all(userId);

    const styles = countJsonValues(
      db.prepare<unknown[], JsonValueRow>('SELECT styles AS value FROM releases WHERE user_id = ? AND styles IS NOT NULL').all(userId),
      (entry) => entry
    ).slice(0, 15);

    const growth = db.prepare(`
      SELECT substr(date_added, 1, 7) AS month, COUNT(*) AS count
      FROM releases
      WHERE user_id = ? AND date_added IS NOT NULL AND date_added != ''
      GROUP BY substr(date_added, 1, 7)
      ORDER BY month ASC
    `).all(userId);

    const topValue = db.prepare<unknown[], Pick<ReleaseRow, 'id' | 'release_id' | 'artist' | 'title' | 'year' | 'cover_url' | 'estimated_value'>>(`
      SELECT id, release_id, artist, title, year, cover_url, estimated_value
      FROM releases
      WHERE user_id = ? AND marketplace_status = ? AND estimated_value IS NOT NULL AND estimated_value > 0
      ORDER BY estimated_value DESC, artist ASC
      LIMIT 10
    `).all(userId, MARKETPLACE_STATUS.PRICED);

    const artists = db.prepare(`
      SELECT artist, COUNT(*) AS count
      FROM releases
      WHERE user_id = ?
      GROUP BY artist
      ORDER BY count DESC, artist ASC
      LIMIT 20
    `).all(userId);

    const gradeOrder = (name: string) => {
      const index = fieldMap.mediaOptions.indexOf(name);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const conditions = countFieldValues(userId, fieldMap.mediaFieldId)
      .map((row) => ({ name: row.name || '__ungraded__', count: row.count }))
      .sort((a, b) => gradeOrder(a.name) - gradeOrder(b.name));

    const folderNames = new Map(getCollectionFolders(userId).map((folder) => [folder.id, folder.name]));
    const folders = folderNames.size
      ? db.prepare<unknown[], CountRow & { id: number }>(`
          SELECT folder_id AS id, COUNT(*) AS count
          FROM releases
          WHERE user_id = ?
          GROUP BY folder_id
          ORDER BY count DESC
        `).all(userId).map((row) => ({ ...row, name: folderNames.get(row.id) || `#${row.id}` }))
      : [];

    const lastSync = db.prepare(`
      SELECT started_at, finished_at, records_synced, status
      FROM sync_log
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(userId);

    res.json(normalizeDashboardStats({
      totals: {
        total_records: totalRecords,
        total_value: await convertAmount(totalValueEur, DEFAULT_CURRENCY, displayCurrency),
        rated_records: ratedRecords,
        notes_records: notesRecords,
        priced_records: pricedRecords,
        value_pending_records: valuePendingRecords,
        value_failed_records: valueFailedRecords,
        value_unavailable_records: valueUnavailableRecords
      },
      genres: genres.slice(0, 12),
      decades,
      formats,
      labels,
      styles,
      growth,
      topValue: await Promise.all(topValue.map(async (release) => ({
        ...release,
        estimated_value: await convertAmount(release.estimated_value, DEFAULT_CURRENCY, displayCurrency)
      }))),
      artists,
      radar: buildRadarDashboardSummary(radar),
      conditions,
      folders,
      community: buildCommunitySummary(userId),
      collectionValue: await buildCollectionValue(userId, displayCurrency),
      lastSync,
      displayCurrency
    }));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

export default router;
