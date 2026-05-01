import type Database from 'better-sqlite3';

type ReleaseIdRow = {
  id: number;
};

export function pruneUnseenReleases(db: Database.Database, userId: number, syncId: number): number[] {
  const reconcileTx = db.transaction((targetUserId: number, targetSyncId: number): number[] => {
    const staleReleaseIds = db.prepare<[number, number], ReleaseIdRow>(`
      SELECT id
      FROM releases
      WHERE user_id = ?
        AND (last_seen_sync_id IS NULL OR last_seen_sync_id != ?)
    `).all(targetUserId, targetSyncId).map((row) => row.id);

    if (!staleReleaseIds.length) {
      return [];
    }

    db.prepare<[number, number]>(`
      DELETE FROM releases
      WHERE user_id = ?
        AND (last_seen_sync_id IS NULL OR last_seen_sync_id != ?)
    `).run(targetUserId, targetSyncId);

    return staleReleaseIds;
  });

  return reconcileTx(userId, syncId);
}
