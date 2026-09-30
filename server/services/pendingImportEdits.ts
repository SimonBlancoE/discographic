import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseStoredNotes, replaceNoteText } from './notes.js';
import { withCollectionWriter } from './collectionWriters.js';
import type { UserJobScope } from './userJobs.js';

type PendingEdit = {
  user_id: number;
  instance_id: number;
  field_id: number; // 0 is rating; positive IDs are the actual Discogs custom fields.
  revision: string;
  value: string;
  error: string | null;
};
type PendingFieldFailure = { fieldId: number; reason: string };
export type PendingInstance = { instanceId: number; releaseId: number; dbId: number | null; artist: string; title: string };
type Release = { id: number; release_id: number; instance_id: number; folder_id: number; notes: string };
type DiscogsWriter = {
  updateRating: (input: { folderId: number; releaseId: number; instanceId: number; rating: number }, options: { signal: AbortSignal }) => Promise<unknown>;
  updateField: (input: { folderId: number; releaseId: number; instanceId: number; fieldId: number; value: string }, options: { signal: AbortSignal }) => Promise<unknown>;
};

export function migratePendingImportEdits(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS pending_import_edits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_id INTEGER NOT NULL,
    release_id INTEGER NOT NULL,
    field_id INTEGER NOT NULL CHECK(field_id >= 0),
    revision TEXT NOT NULL,
    value TEXT NOT NULL,
    error TEXT,
    PRIMARY KEY(user_id, instance_id, field_id)
  )`);
}

// Called inside the transaction that confirms the Local collection edit. UUID revisions
// cannot repeat after successful acknowledgement, replacement, restart, or account reset.
export function queueImportEdit(db: Database.Database, userId: number, instanceId: number, releaseId: number, fieldId: number, value: string | number): void {
  db.prepare(`INSERT INTO pending_import_edits (user_id, instance_id, release_id, field_id, revision, value)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, instance_id, field_id) DO UPDATE SET
    release_id = excluded.release_id, revision = excluded.revision, value = excluded.value, error = NULL`)
    .run(userId, instanceId, releaseId, fieldId, randomUUID(), String(value));
}

function pendingField(db: Database.Database, userId: number, instanceId: number, fieldId: number): PendingEdit | undefined {
  return db.prepare<[number, number, number], PendingEdit>('SELECT * FROM pending_import_edits WHERE user_id = ? AND instance_id = ? AND field_id = ?')
    .get(userId, instanceId, fieldId);
}
export function pendingRevision(db: Database.Database, userId: number, instanceId: number, fieldId: number): string | null {
  return pendingField(db, userId, instanceId, fieldId)?.revision ?? null;
}
function acknowledge(db: Database.Database, edit: PendingEdit): void {
  db.prepare('DELETE FROM pending_import_edits WHERE user_id = ? AND instance_id = ? AND field_id = ? AND revision = ? AND value = ?')
    .run(edit.user_id, edit.instance_id, edit.field_id, edit.revision, edit.value);
}

// Mirror an accepted individual edit only if no newer import was confirmed during its
// upstream request. Callers must hold the instance writer lane and only call after success.
export function acceptIndividualEdit(db: Database.Database, userId: number, instanceId: number, fieldId: number, revision: string | null, value: string | number): void {
  db.transaction(() => {
    const pending = pendingField(db, userId, instanceId, fieldId);
    if ((pending?.revision ?? null) !== revision) return;
    if (fieldId === 0) {
      db.prepare('UPDATE releases SET rating = ?, synced_at = CURRENT_TIMESTAMP WHERE user_id = ? AND instance_id = ?').run(value, userId, instanceId);
    } else {
      const release = db.prepare<[number, number], Release>('SELECT notes FROM releases WHERE user_id = ? AND instance_id = ?').get(userId, instanceId);
      if (!release) return;
      db.prepare('UPDATE releases SET notes = ?, synced_at = CURRENT_TIMESTAMP WHERE user_id = ? AND instance_id = ?')
        .run(JSON.stringify(replaceNoteText(parseStoredNotes(release.notes), value, fieldId)), userId, instanceId);
    }
    if (pending) acknowledge(db, pending);
  })();
}

export function pendingImportCounts(db: Database.Database, userId: number): { pending: number; pendingFailed: number } {
  return db.prepare<[number], { pending: number; pendingFailed: number }>(`SELECT COUNT(*) AS pending,
    COALESCE(SUM(error IS NOT NULL), 0) AS pendingFailed FROM pending_import_edits WHERE user_id = ?`).get(userId)!;
}
export function pendingImportInstances(db: Database.Database, userId: number): PendingInstance[] {
  return db.prepare<[number], PendingInstance>(`SELECT p.instance_id AS instanceId, p.release_id AS releaseId,
    r.id AS dbId, COALESCE(r.artist, '') AS artist, COALESCE(r.title, '') AS title
    FROM pending_import_edits p LEFT JOIN releases r ON r.user_id = p.user_id AND r.instance_id = p.instance_id
    WHERE p.user_id = ? GROUP BY p.instance_id ORDER BY p.instance_id`).all(userId);
}
export function clearPendingImportEdits(db: Database.Database, userId: number): void {
  db.prepare('DELETE FROM pending_import_edits WHERE user_id = ?').run(userId);
}
export function markMissingPendingInstances(db: Database.Database, userId: number): void {
  db.prepare(`UPDATE pending_import_edits SET error = 'Collection instance is missing'
    WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM releases r
      WHERE r.user_id = pending_import_edits.user_id AND r.instance_id = pending_import_edits.instance_id)`).run(userId);
}
export function overlayPendingImportEdits(db: Database.Database, userId: number, instanceId: number, incoming: { rating: number; notes: string }): { rating: number; notes: string } {
  const result = { ...incoming };
  for (const edit of db.prepare<[number, number], PendingEdit>('SELECT * FROM pending_import_edits WHERE user_id = ? AND instance_id = ?').all(userId, instanceId)) {
    if (edit.field_id === 0) result.rating = Number(edit.value);
    else result.notes = JSON.stringify(replaceNoteText(parseStoredNotes(result.notes), edit.value, edit.field_id));
  }
  return result;
}

export async function sendPendingImportEdits(db: Database.Database, userId: number, instanceId: number, discogs: DiscogsWriter, run: UserJobScope): Promise<PendingFieldFailure[]> {
  return withCollectionWriter(userId, instanceId, run, async () => {
    // Resolve both the queue and current folder inside the shared writer lane.
    const edits = db.prepare<[number, number], PendingEdit>('SELECT * FROM pending_import_edits WHERE user_id = ? AND instance_id = ? ORDER BY field_id').all(userId, instanceId);
    const errors: PendingFieldFailure[] = [];
    for (const edit of edits) {
      run.assertCurrent();
      if (pendingRevision(db, userId, instanceId, edit.field_id) !== edit.revision) continue;
      try {
        const release = db.prepare<[number, number], Release>('SELECT * FROM releases WHERE user_id = ? AND instance_id = ?').get(userId, instanceId);
        if (!release) throw new Error('Collection instance is missing');
        const base = { folderId: release.folder_id || 0, releaseId: release.release_id, instanceId };
        if (edit.field_id === 0) await discogs.updateRating({ ...base, rating: Number(edit.value) }, { signal: run.signal });
        else await discogs.updateField({ ...base, fieldId: edit.field_id, value: edit.value }, { signal: run.signal });
        run.assertCurrent();
        acknowledge(db, edit);
      } catch (error) {
        run.assertCurrent();
        const reason = error instanceof Error ? error.message : String(error);
        db.prepare('UPDATE pending_import_edits SET error = ? WHERE user_id = ? AND instance_id = ? AND field_id = ? AND revision = ? AND value = ?')
          .run(reason, userId, instanceId, edit.field_id, edit.revision, edit.value);
        errors.push({ fieldId: edit.field_id, reason });
      }
    }
    return errors;
  });
}
