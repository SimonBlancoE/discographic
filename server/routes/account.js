import express from 'express';
import { normalizeAccountResponse } from '../../shared/contracts/account.js';
import { clearUserCollectionData, getDiscogsAccount, getSettingForUser, setSettingForUser, upsertDiscogsAccount } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { normalizeCurrency } from '../../shared/currency.js';

const router = express.Router();

router.use(requireAuth);

function maskToken(token) {
  if (!token || token.length <= 8) {
    return null;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function serializeAccount(account, userId) {
  return normalizeAccountResponse({
    discogsUsername: account?.discogs_username || '',
    tokenConfigured: Boolean(account?.discogs_token),
    tokenPreview: account?.discogs_token ? maskToken(account.discogs_token) : null,
    currency: normalizeCurrency(getSettingForUser(userId, 'currency', 'EUR'))
  });
}

router.get('/', (req, res) => {
  const account = getDiscogsAccount(req.session.userId);
  res.json(serializeAccount(account, req.session.userId));
});

router.put('/', (req, res) => {
  const discogsUsername = String(req.body.discogsUsername || '').trim();
  const discogsToken = String(req.body.discogsToken || '').trim();
  const currentAccount = getDiscogsAccount(req.session.userId);

  if (!discogsUsername) {
    return res.status(400).json({ error: req.t('backend.account.userRequired') });
  }

  if (req.body.currency) {
    setSettingForUser(req.session.userId, 'currency', normalizeCurrency(req.body.currency));
  }

  const tokenChanged = Boolean(discogsToken) && discogsToken !== currentAccount?.discogs_token;
  const shouldResetCache = !currentAccount || currentAccount.discogs_username !== discogsUsername || tokenChanged;
  if (shouldResetCache) {
    clearUserCollectionData(req.session.userId);
  }

  const account = upsertDiscogsAccount(req.session.userId, discogsUsername, discogsToken || undefined);
  return res.json({
    ...serializeAccount(account, req.session.userId),
    cacheReset: shouldResetCache,
    message: shouldResetCache
      ? req.t('backend.account.updatedReset')
      : req.t('backend.account.updated')
  });
});

router.post('/reset', (req, res) => {
  clearUserCollectionData(req.session.userId);
  return res.json({ ok: true, message: req.t('backend.account.reset') });
});

// Whitelist of valid preference keys. Add new entries here when introducing
// new user-facing preferences that should be persisted via the API.
const ALLOWED_PREFERENCE_KEYS = new Set([
  'collection_visible_columns',
  'currency',
]);

router.get('/preferences/:key', (req, res) => {
  if (!ALLOWED_PREFERENCE_KEYS.has(req.params.key)) {
    return res.status(400).json({ error: 'Unknown preference key' });
  }
  const value = getSettingForUser(req.session.userId, req.params.key);
  res.json({ value });
});

router.put('/preferences/:key', (req, res) => {
  if (!ALLOWED_PREFERENCE_KEYS.has(req.params.key)) {
    return res.status(400).json({ error: 'Unknown preference key' });
  }
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: 'value is required' });
  }
  const nextValue = req.params.key === 'currency'
    ? normalizeCurrency(value)
    : typeof value === 'string' ? value : JSON.stringify(value);
  setSettingForUser(req.session.userId, req.params.key, nextValue);
  res.json({ ok: true });
});

export default router;
