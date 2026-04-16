// Shared status / phase enums for the long-running sync and import jobs.
// Both client polling code and server state writers must agree on these
// strings — they ride on the wire as bare values.

export const SYNC_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const SYNC_PHASE = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  ERROR: 'error'
};

export const LISTING_STATUS = {
  FOR_SALE: 'For Sale',
  DRAFT: 'Draft'
};
