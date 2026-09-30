import type Database from 'better-sqlite3';

/** Installs the Local collection revision in the startup schema transaction. */
export function migrateCollectionFacetRevision(db: Database.Database): void {
  // SQLite owns invalidation for every writer connection. Trigger updates are
  // atomic with their release writes and roll back with them. One row suffices:
  // release writes conservatively invalidate all users, sessions/settings do not.
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_facet_revision (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO collection_facet_revision (id, revision) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;

    CREATE TRIGGER IF NOT EXISTS collection_facets_insert AFTER INSERT ON releases
    BEGIN
      UPDATE collection_facet_revision SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS collection_facets_update AFTER UPDATE ON releases
    BEGIN
      UPDATE collection_facet_revision SET revision = revision + 1 WHERE id = 1;
    END;
    CREATE TRIGGER IF NOT EXISTS collection_facets_delete AFTER DELETE ON releases
    BEGIN
      UPDATE collection_facet_revision SET revision = revision + 1 WHERE id = 1;
    END;
  `);
}

export function getCollectionFacetRevision(db: Database.Database): number {
  return db.prepare<[], { revision: number }>(
    'SELECT revision FROM collection_facet_revision WHERE id = 1',
  ).get()!.revision;
}
