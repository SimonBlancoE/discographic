export function pruneUnseenReleases(db, userId, syncId) {
  const reconcileTx = db.transaction((targetUserId, targetSyncId) => {
    const staleReleaseIds = db.prepare(`
      SELECT id
      FROM releases
      WHERE user_id = ?
        AND (last_seen_sync_id IS NULL OR last_seen_sync_id != ?)
    `).all(targetUserId, targetSyncId).map((row) => row.id);

    if (!staleReleaseIds.length) {
      return [];
    }

    db.prepare(`
      DELETE FROM releases
      WHERE user_id = ?
        AND (last_seen_sync_id IS NULL OR last_seen_sync_id != ?)
    `).run(targetUserId, targetSyncId);

    return staleReleaseIds;
  });

  return reconcileTx(userId, syncId);
}
