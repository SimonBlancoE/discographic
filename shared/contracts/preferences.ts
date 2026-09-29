import { COLLECTION_SAVED_VIEWS_KEY } from './collectionViews.js';

// User-facing preferences: persisted through the preferences API and kept when the
// local collection is reset or the Discogs account changes.
export const USER_PREFERENCE_KEYS = Object.freeze([
  COLLECTION_SAVED_VIEWS_KEY,
  'collection_visible_columns',
  'collection_view_mode',
  'currency',
]);
