import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db, { parseJson, stringifyJson } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

// In-memory preview cache (userId -> { id, data, expiresAt })
const previewCache = new Map();
const PREVIEW_TTL_MS = 10 * 60 * 1000;

// In-memory import sync state per user
const importSyncStates = new Map();

function cleanPreviewCache() {
  const now = Date.now();
  for (const [key, entry] of previewCache) {
    if (entry.expiresAt < now) previewCache.delete(key);
  }
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

function parseFile(buffer, filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new Error('File must be .xlsx or .csv. Other formats are not supported.');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file does not contain any sheets.');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new Error('The file does not contain any data rows.');

  return rows;
}

function mapColumns(rows) {
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
    throw new Error('No identification column found (ID, Release_Discogs, or Instance). Make sure your file has at least one of these columns.');
  }

  if (!hasEditable) {
    throw new Error('No editable columns found (Rating or Notes). Add at least one of these columns to your file.');
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

function extractChanges(userId, rows, columnMap) {
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
      unmatchedRows.push({ row: rowNum, identifier, reason: 'No encontrado en tu coleccion' });
      continue;
    }

    const currentNotes = parseJson(release.notes, []);
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
          errors.push({ row: rowNum, column: 'Rating', value: String(rawValue), reason: 'El rating debe estar entre 0 y 5' });
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

function getImportSyncState(userId) {
  if (!importSyncStates.has(userId)) {
    importSyncStates.set(userId, {
      status: 'idle',
      current: 0,
      total: 0,
      message: 'Sin importacion activa'
    });
  }
  return importSyncStates.get(userId);
}

function setImportSyncState(userId, patch) {
  importSyncStates.set(userId, { ...getImportSyncState(userId), ...patch });
}

async function syncChangesWithDiscogs({ userId, changes, discogs }) {
  setImportSyncState(userId, {
    status: 'running',
    current: 0,
    total: changes.length,
    message: `Sincronizando 0/${changes.length} con Discogs...`
  });

  let synced = 0;
  for (const change of changes) {
    const release = db.prepare(
      'SELECT folder_id, release_id, instance_id, notes FROM releases WHERE id = ? AND user_id = ?'
    ).get(change.dbId, userId);

    if (!release) continue;

    const base = {
      folderId: release.folder_id || 0,
      releaseId: release.release_id,
      instanceId: release.instance_id
    };

    try {
      if (change.ratingChanged) {
        await discogs.updateRating({ ...base, rating: change.newRating });
      }

      if (change.notesChanged) {
        const currentNotes = parseJson(release.notes, []);
        const notesFieldId = currentNotes.find((n) => n.field_id === 3) ? 3
          : currentNotes.length > 0 ? (currentNotes[currentNotes.length - 1].field_id || 3) : 3;

        await discogs.updateField({
          ...base,
          fieldId: notesFieldId,
          value: change.newNotes
        });
      }
    } catch (error) {
      console.error('[import-sync] error:', change.releaseId, error.message);
    }

    synced += 1;
    setImportSyncState(userId, {
      current: synced,
      message: `Sincronizando ${synced}/${changes.length} con Discogs...`
    });
  }

  setImportSyncState(userId, {
    status: 'completed',
    current: synced,
    total: changes.length,
    message: `${synced} cambios sincronizados con Discogs correctamente.`
  });
}

router.get('/template', (req, res) => {
  const data = [
    {
      ID: 12231071,
      Artista: 'Yes (ejemplo)',
      Titulo: 'The Steven Wilson Remixes (ejemplo)',
      Rating: 5,
      Notas: 'Edicion limitada, comprado en 2024'
    }
  ];

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Importar');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="discographic-import-template.xlsx"');
  res.send(buffer);
});

router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha recibido ningun archivo.' });
    }

    const rows = parseFile(req.file.buffer, req.file.originalname);
    const columnMap = mapColumns(rows);
    const { changes, unmatchedRows, errors } = extractChanges(req.session.userId, rows, columnMap);

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
        message: 'No se han detectado cambios entre el archivo y tu coleccion actual.'
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
      return res.status(400).json({ error: 'Falta el ID de la vista previa.' });
    }

    const cached = previewCache.get(previewId);
    if (!cached || cached.userId !== req.session.userId || cached.expiresAt < Date.now()) {
      return res.status(410).json({ error: 'La vista previa ha expirado. Sube el archivo de nuevo.' });
    }

    const { changes } = cached;
    previewCache.delete(previewId);
    const userId = req.session.userId;

    const applyTx = db.transaction(() => {
      for (const change of changes) {
        if (change.ratingChanged) {
          db.prepare('UPDATE releases SET rating = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(change.newRating, change.dbId, userId);
        }
        if (change.notesChanged) {
          const current = parseJson(
            db.prepare('SELECT notes FROM releases WHERE id = ? AND user_id = ?').get(change.dbId, userId)?.notes,
            []
          );
          const fieldId = current.find((n) => n.field_id === 3) ? 3
            : current.length > 0 ? (current[current.length - 1].field_id || 3) : 3;

          let updated = current.map((n) => n.field_id === fieldId ? { ...n, value: change.newNotes } : n);
          if (!current.some((n) => n.field_id === fieldId)) {
            updated = [...current, { field_id: fieldId, value: change.newNotes }];
          }

          db.prepare('UPDATE releases SET notes = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
            .run(stringifyJson(updated), change.dbId, userId);
        }
      }
    });

    applyTx();
    res.json({ ok: true, applied: changes.length });

    // Background sync with Discogs
    let discogs;
    try {
      discogs = getDiscogsClientForUser(req);
    } catch {
      setImportSyncState(userId, {
        status: 'completed',
        current: changes.length,
        total: changes.length,
        message: `${changes.length} cambios guardados localmente. No se pudo conectar con Discogs para sincronizar.`
      });
      return;
    }

    syncChangesWithDiscogs({ userId, changes, discogs }).catch((error) => {
      setImportSyncState(userId, {
        status: 'failed',
        message: `Error sincronizando con Discogs: ${error.message}`
      });
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/status', (req, res) => {
  res.json(getImportSyncState(req.session.userId));
});

export default router;
