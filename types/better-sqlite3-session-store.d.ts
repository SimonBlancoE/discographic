declare module 'better-sqlite3-session-store' {
  import type Database from 'better-sqlite3';
  import type session from 'express-session';

  type SqliteStoreOptions = session.SessionOptions & {
    client: Database.Database;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  };

  class SqliteStore extends session.Store {
    constructor(options: SqliteStoreOptions);
    get: session.Store['get'];
    set: session.Store['set'];
    destroy: session.Store['destroy'];
  }

  export default function connectSqlite3(
    sessionModule: typeof session,
  ): typeof SqliteStore;
}
