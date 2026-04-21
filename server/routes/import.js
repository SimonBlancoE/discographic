import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db, { normalizeNotes, parseJson, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import {
  buildImportFailure,
  createIdleImportSyncState,
  createLocalOnlyImportSyncState,
  createRunningImportSyncState,
  summarizeImportSyncResult,
  summarizeInterruptedImportSync
} from '../services/importSync.js';
import { translate } from '../../shared/i18n.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

// In-memory preview cache (userId -> { id, data, expiresAt })
const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

// In-memory import sync state per user
const importSyncStates = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanPreviewCache() {
  const now = Date.now();
  for (const [key, entry] of previewCache) {
    if (entry.expiresAt < now) previewCache.delete(key);
  }
}

function importT(locale, key, vars) {
  return translate(locale || 'es', key, vars);
}

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ID_COLUMNS = new Map([
  ['id', 'id'],
  ['releasediscogs', 'release_id'],
  ['discogsrelease', 'release_id'],
  ['releaseid', 'release_id'],
  ['instancia', 'instance_id'],
  ['instance', 'instance_id'],
  ['instanceid', 'instance_id'],
]);

const EDITABLE_COLUMNS = new Set(['rating', 'notas', 'notes']);

function parseFile(buffer, filename, t) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new Error(t('backend.import.fileType'));
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(t('backend.import.noSheets'));

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new Error(t('backend.import.noRows'));

  return rows;
}

function mapColumns(rows, t) {
  const headers = Object.keys(rows[0]);
  const columnMap = {};
  let hasId = false;
  let hasEditable = false;

  for (const header of headers) {
    const normalized = normalizeHeader(header);

    if (ID_COLUMNS.has(normalized)) {
      columnMap[header] = { type: 'id', dbField: ID_COLUMNS.get(normalized) };
      hasId = true;
    } else if (normalized === 'rating') {
      columnMap[header] = { type: 'editable', dbField: 'rating' };
      hasEditable = true;
    } else if (normalized === 'notas' || normalized === 'notes') {
      columnMap[header] = { type: 'editable', dbField: 'notes' };
      hasEditable = true;
    }
  }

  if (!hasId) {
    throw new Error(t('backend.import.idColumnRequired'));
  }

  if (!hasEditable) {
    throw new Error(t('backend.import.editableColumnRequired'));
  }

  return columnMap;
}

function findRelease(userId, row, columnMap) {
  for (const [header, mapping] of Object.entries(columnMap)) {
    if (mapping.type !== 'id') continue;
    const value = row[header];
    if (!value && value !== 0) continue;

    const numValue = Number(value);
    if (!Number.isFinite(numValue)) continue;

    const release = db.prepare(
      `SELECT id, release_id, instance_id, artist, title, rating, notes FROM releases WHERE user_id = ? AND ${mapping.dbField} = ?`
    ).get(userId, numValue);

    if (release) return release;
  }

  return null;
}

function extractChanges(userId, rows, columnMap, t) {
  const changes = [];
  const unmatchedRows = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    const release = findRelease(userId, row, columnMap);
    if (!release) {
      const identifier = Object.entries(columnMap)
        .filter(([, m]) => m.type === 'id')
        .map(([h]) => row[h])
        .filter(Boolean)
        .join('/');
      unmatchedRows.push({ row: rowNum, identifier, reason: t('backend.import.unmatched') });
      continue;
    }

    const currentNotes = normalizeNotes(parseJson(release.notes, []));
    const currentNotesText = currentNotes.map((n) => n?.value).filter(Boolean).join(' | ');
    const change = {
      dbId: release.id,
      releaseId: release.release_id,
      instanceId: release.instance_id,
      artist: release.artist,
      title: release.title,
      currentRating: release.rating || 0,
      newRating: release.rating || 0,
      ratingChanged: false,
      currentNotes: currentNotesText,
      newNotes: currentNotesText,
      notesChanged: false,
      hasChanges: false
    };

    for (const [header, mapping] of Object.entries(columnMap)) {
      if (mapping.type !== 'editable') continue;
      const rawValue = row[header];

      if (mapping.dbField === 'rating') {
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
        const numRating = Number(rawValue);
        if (!Number.isFinite(numRating) || numRating < 0 || numRating > 5) {
          errors.push({ row: rowNum, column: t('collection.rating'), value: String(rawValue), reason: t('backend.import.invalidRating') });
          continue;
        }
        const rounded = Math.round(numRating);
        if (rounded !== change.currentRating) {
          change.newRating = rounded;
          change.ratingChanged = true;
          change.hasChanges = true;
        }
      }

      if (mapping.dbField === 'notes') {
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
        const text = String(rawValue).trim().slice(0, 500);
        if (text !== change.currentNotes) {
          change.newNotes = text;
          change.notesChanged = true;
          change.hasChanges = true;
        }
      }
    }

    if (change.hasChanges) {
      changes.push(change);
    }
  }

  return { changes, unmatchedRows, errors };
}

// ---------------------------------------------------------------------------
// Background sync with Discogs
// ---------------------------------------------------------------------------

function getImportSyncState(userId, locale = 'es') {
  if (!importSyncStates.has(userId)) {
    importSyncStates.set(userId, createIdleImportSyncState({
      locale,
      t: (key, vars) => importT(locale, key, vars)
    }));
  }
  return importSyncStates.get(userId);
}

function setImportSyncState(userId, patch) {
  importSyncStates.set(userId, { ...getImportSyncState(userId, patch.locale), ...patch });
}

async function syncChangesWithDiscogs({ userId, changes, discogs, locale }) {
  const t = (key, vars) => importT(locale, key, vars);
  let processed = 0;
  let synced = 0;
  const failures = [];

  try {
    for (const change of changes) {
      const release = db.prepare(
        'SELECT folder_id, release_id, instance_id, notes FROM releases WHERE id = ? AND user_id = ?'
      ).get(change.dbId, userId);

      if (!release) {
        failures.push(buildImportFailure(change, t('backend.import.releaseMissing')));
        processed += 1;
        setImportSyncState(userId, createRunningImportSyncState({
          locale,
          current: processed,
          total: changes.length,
          synced,
          failures,
          t
        }));
        continue;
      }

      const base = {
        folderId: release.folder_id || 0,
        releaseId: release.release_id,
        instanceId: release.instance_id
      };

      const itemErrors = [];

      if (change.ratingChanged) {
        try {
          await discogs.updateRating({ ...base, rating: change.newRating });
        } catch (error) {
          itemErrors.push(`${t('collection.rating')}: ${error?.message || t('backend.import.unknownSyncError')}`);
        }
      }

      if (change.notesChanged) {
        const currentNotes = normalizeNotes(parseJson(release.notes, []));
        const notesFieldId = currentNotes.find((n) => n.field_id === 3) ? 3
          : currentNotes.length > 0 ? (currentNotes[currentNotes.length - 1].field_id || 3) : 3;

        try {
          await discogs.updateField({
            ...base,
            fieldId: notesFieldId,
            value: change.newNotes
          });
        } catch (error) {
          itemErrors.push(`${t('collection.notes')}: ${error?.message || t('backend.import.unknownSyncError')}`);
        }
      }

      if (itemErrors.length) {
        failures.push(buildImportFailure(change, itemErrors.join(' | ')));
      } else {
        synced += 1;
      }

      processed += 1;
      setImportSyncState(userId, createRunningImportSyncState({
        locale,
        current: processed,
        total: changes.length,
        synced,
        failures,
        t
      }));
    }

    setImportSyncState(userId, summarizeImportSyncResult({
      locale,
      total: changes.length,
      synced,
      failures,
      t
    }));
  } catch (error) {
    setImportSyncState(userId, summarizeInterruptedImportSync({
      locale,
      total: changes.length,
      processed,
      synced,
      failures,
      error,
      t
    }));
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get('/template', (req, res) => {
  const data = [
    {
      [req.t('export.id')]: 12231071,
      [req.t('collection.artist')]: req.t('backend.import.templateArtistSample'),
      [req.t('collection.titleColumn')]: req.t('backend.import.templateTitleSample'),
      [req.t('collection.rating')]: 5,
      [req.t('collection.notes')]: req.t('backend.import.templateNotesSample')
    }
  ];

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, req.t('backend.import.templateSheetName'));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="discographic-import-template.xlsx"');
  res.send(buffer);
});

router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: req.t('backend.import.fileRequired') });
    }

    const rows = parseFile(req.file.buffer, req.file.originalname, req.t);
    const columnMap = mapColumns(rows, req.t);
    const { changes, unmatchedRows, errors } = extractChanges(req.session.userId, rows, columnMap, req.t);

    if (!changes.length && !errors.length) {
      return res.json({
        previewId: null,
        totalRows: rows.length,
        matched: rows.length - unmatchedRows.length,
        withChanges: 0,
        unmatched: unmatchedRows.length,
        changes: [],
        unmatchedRows,
        errors,
        message: req.t('backend.import.noChangesDetected')
      });
    }

    cleanPreviewCache();
    const previewId = crypto.randomBytes(16).toString('hex');
    previewCache.set(previewId, {
      userId: req.session.userId,
      changes,
      expiresAt: Date.now() + PREVIEW_TTL_MS
    });

    return res.json({
      previewId,
      totalRows: rows.length,
      matched: rows.length - unmatchedRows.length,
      withChanges: changes.length,
      unmatched: unmatchedRows.length,
      changes,
      unmatchedRows,
      errors
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/apply', async (req, res) => {
  try {
    const { previewId } = req.body;
    if (!previewId) {
      return res.status(400).json({ error: req.t('backend.import.previewIdRequired') });
    }

    const cached = previewCache.get(previewId);
    if (!cached || cached.userId !== req.session.userId || cached.expiresAt < Date.now()) {
      return res.status(410).json({ error: req.t('backend.import.previewExpired') });
    }

    const { changes } = cached;
    previewCache.delete(previewId);
    const userId = req.session.userId;

    // Apply to local DB immediately
    const applyTx = db.transaction(() => {
      for (const change of changes) {
        if (change.ratingChanged) {
          db.prepare('UPDATE releases SET rating = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(change.newRating, change.dbId, userId);
        }
        if (change.notesChanged) {
          const current = normalizeNotes(parseJson(
            db.prepare('SELECT notes FROM releases WHERE id = ? AND user_id = ?').get(change.dbId, userId)?.notes,
            []
          ));
          const fieldId = current.find((n) => n.field_id === 3) ? 3
            : current.length > 0 ? (current[current.length - 1].field_id || 3) : 3;

          let updated = current.filter((n) => n.field_id !== fieldId);
          if (change.newNotes) {
            updated = normalizeNotes([...updated, { field_id: fieldId, value: change.newNotes }]);
          }

          db.prepare('UPDATE releases SET notes = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(stringifyJson(updated), change.dbId, userId);
        }
      }
    });

    applyTx();
    let discogs;
    try {
      discogs = getDiscogsClientForUser(req);
    } catch {
      const syncState = createLocalOnlyImportSyncState({
        locale: req.locale,
        total: changes.length,
        t: req.t
      });
      setImportSyncState(userId, syncState);
      return res.json({ ok: true, applied: changes.length, syncState });
    }

    const syncState = createRunningImportSyncState({
      locale: req.locale,
      current: 0,
      total: changes.length,
      synced: 0,
      failures: [],
      t: req.t
    });
    setImportSyncState(userId, syncState);
    res.json({ ok: true, applied: changes.length, syncState });

    // Background sync with Discogs
    void syncChangesWithDiscogs({ userId, changes, discogs, locale: req.locale });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/status', (req, res) => {
  res.json(getImportSyncState(req.session.userId, req.locale));
});

export default router;
