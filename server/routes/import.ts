// @ts-nocheck
import crypto from 'crypto';
import { createUserJobScope, registerUserJobCanceller } from '../services/userJobs.js';
import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db, { getCollectionFieldMap, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import {
  buildImportFailure,
  createIdleImportSyncState,
  createLocalOnlyImportSyncState,
  createRunningImportSyncState,
  summarizeImportSyncResult,
  summarizeInterruptedImportSync
} from '../services/importSync.js';
import { getNoteFieldText, notesToText, parseStoredNotes, replaceNoteText } from '../services/notes.js';
import { translate } from '../../shared/i18n.js';
import { normalizeImportSyncState } from '../../shared/contracts/syncStatus.js';
import { resolveImportIdentity } from '../services/importIdentity.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

// In-memory preview cache (userId -> { id, data, expiresAt })
const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

// In-memory import sync state per user
const importSyncStates = new Map();
const importRuns = new Map();
registerUserJobCanceller(userId => {
  importRuns.get(userId)?.cancel();
  importRuns.delete(userId);
  importSyncStates.delete(userId);
  for (const [id, preview] of previewCache) {
    if (preview.userId === userId) previewCache.delete(id);
  }
});
// Capture before multer's asynchronous upload boundary.
router.use((req, _res, next) => {
  req.accountScope = createUserJobScope(req.session.userId);
  next();
});


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
  ['iddiscogs', 'release_id'],
  ['releasediscogs', 'release_id'],
  ['discogsrelease', 'release_id'],
  ['releaseid', 'release_id'],
  ['instancia', 'instance_id'],
  ['instance', 'instance_id'],
  ['instanceid', 'instance_id'],
]);

function parseFile(buffer, filename, t) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new Error(t('backend.import.fileType'));
  }

  // Preserve CSV identity text so malformed IDs are not coerced before validation.
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(t('backend.import.noSheets'));

  const sheet = workbook.Sheets[sheetName];
  const headerRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  headerRange.e.r = headerRange.s.r;
  const [headers = []] = XLSX.utils.sheet_to_json(sheet, { header: 1, range: headerRange });
  const identityHeaders = new Set();
  // Check original headers before SheetJS renames repeats (e.g. Instance ID_1).
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!ID_COLUMNS.has(normalized)) continue;
    if (identityHeaders.has(normalized)) {
      throw new Error(t('backend.import.duplicateIdentityColumn', { column: String(header) }));
    }
    identityHeaders.add(normalized);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
    } else if (normalized === 'rating' || normalized === 'valoracion' || normalized === 'valoracin') {
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

function extractChanges(userId, rows, columnMap, t) {
  const changes = [];
  const unmatchedRows = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    const { release, reason } = resolveImportIdentity(db, userId, row, columnMap);
    if (!release) {
      const identifier = Object.entries(columnMap)
        .filter(([, m]) => m.type === 'id')
        .map(([h]) => row[h])
        .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
        .join('/');
      const rejection = t(`backend.import.${reason}`);
      unmatchedRows.push({ row: rowNum, identifier, reason: rejection });
      if (reason !== 'unmatched') {
        errors.push({ row: rowNum, column: t('export.id'), value: identifier, reason: rejection });
      }
      continue;
    }

    const currentNotes = parseStoredNotes(release.notes);
    const currentNotesText = getNoteFieldText(currentNotes, getCollectionFieldMap(userId).notesFieldId);
    // Exports made before v0.4 joined every field ("VG+ | Generic | note") into the Notes column;
    // re-importing such a file must not write that joined text into the Discogs Notes field.
    const legacyJoinedNotes = notesToText(currentNotes);
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
        if (text !== change.currentNotes && text !== legacyJoinedNotes) {
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

async function syncChangesWithDiscogs({ userId, changes, discogs, locale, run }) {
  const t = (key, vars) => importT(locale, key, vars);
  let processed = 0;
  let synced = 0;
  const failures = [];

  try {
    for (const change of changes) {
      if (run.stopped) return;
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
          await discogs.updateRating({ ...base, rating: change.newRating }, { signal: run.signal });
        } catch (error) {
          itemErrors.push(`${t('collection.rating')}: ${error?.message || t('backend.import.unknownSyncError')}`);
        }
      }

      if (run.stopped) return;
      if (change.notesChanged) {
        const notesFieldId = getCollectionFieldMap(userId).notesFieldId;

        try {
          await discogs.updateField({
            ...base,
            fieldId: notesFieldId,
            value: change.newNotes
          }, { signal: run.signal });
        } catch (error) {
          itemErrors.push(`${t('collection.notes')}: ${error?.message || t('backend.import.unknownSyncError')}`);
        }
      }

      if (run.stopped) return;
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
    if (run.stopped) return;
    setImportSyncState(userId, summarizeInterruptedImportSync({
      locale,
      total: changes.length,
      processed,
      synced,
      failures,
      error,
      t
    }));
  } finally {
    if (importRuns.get(userId) === run) importRuns.delete(userId);
  }
}


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
    req.accountScope.assertCurrent();
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

    // Applying another preview replaces the previous background run.
    importRuns.get(userId)?.cancel();
    const run = createUserJobScope(userId);
    importRuns.set(userId, run);

    // Apply to local DB immediately
    const applyTx = db.transaction(() => {
      for (const change of changes) {
        const release = db.prepare('SELECT notes FROM releases WHERE id = ? AND user_id = ?').get(change.dbId, userId);
        if (!release) continue;

        if (change.ratingChanged) {
          db.prepare('UPDATE releases SET rating = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(change.newRating, change.dbId, userId);
        }
        if (change.notesChanged) {
          const current = parseStoredNotes(release.notes);
          const updated = replaceNoteText(current, change.newNotes, getCollectionFieldMap(userId).notesFieldId);

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
      importRuns.delete(userId);
      const syncState = createLocalOnlyImportSyncState({
        locale: req.locale,
        total: changes.length,
        t: req.t
      });
      setImportSyncState(userId, syncState);
      return res.json({ ok: true, applied: changes.length, syncState: normalizeImportSyncState(syncState) });
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
    res.json({ ok: true, applied: changes.length, syncState: normalizeImportSyncState(syncState) });

    // Background sync with Discogs
    void syncChangesWithDiscogs({ userId, changes, discogs, locale: req.locale, run });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/status', (req, res) => {
  res.json(normalizeImportSyncState(getImportSyncState(req.session.userId, req.locale)));
});

export default router;
