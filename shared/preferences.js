// Settings / preferences key registry. Preferences are user-writable from the
// client (mediated through the API allowlist); settings are server-managed
// state stored in the same `settings` table.

export const PREFERENCE_KEYS = {
  COLLECTION_VISIBLE_COLUMNS: 'collection_visible_columns',
  CURRENCY: 'currency'
};

export const ALLOWED_PREFERENCE_KEYS = new Set(Object.values(PREFERENCE_KEYS));

export const SETTING_KEYS = {
  COLLECTION_VALUE: 'collection_value',
  LAST_SYNC_AT: 'last_collection_sync_at'
};
