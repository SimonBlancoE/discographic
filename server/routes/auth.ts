// @ts-nocheck
import bcrypt from 'bcryptjs';
import express from 'express';
import { normalizeAuthStatus, normalizeUser } from '../../shared/contracts/account.js';
import { createUser, getUserAuthById, getUserAuthByUsername, getUserCount, getUserById, migrateLegacyDataToUser, updateUserPasswordHash } from '../db.js';
import { getCurrentUser, requireAuth } from '../middleware/auth.js';
import { createLoginLimiter } from '../middleware/security.js';

const router = express.Router();
const loginLimiter = createLoginLimiter();
// Compared against when the username does not exist, so both paths cost one bcrypt check.
const DUMMY_HASH = bcrypt.hashSync('discographic-timing-guard', 12);

// A fresh session id on every login prevents session fixation.
function startSession(req, res, userId, payload) {
  return req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      return res.status(500).json({ error: req.t('backend.auth.session') });
    }

    req.session.userId = userId;
    return req.session.save((error) => {
      if (error) {
        return res.status(500).json({ error: req.t('backend.auth.session') });
      }

      return res.json(payload());
    });
  });
}

function sanitizeUser(user) {
  return normalizeUser(user);
}

router.get('/status', (req, res) => {
  const user = getCurrentUser(req);
  res.json(normalizeAuthStatus({
    needsBootstrap: getUserCount() === 0,
    loggedIn: Boolean(user),
    user: sanitizeUser(user)
  }));
});

router.post('/bootstrap', async (req, res) => {
  if (getUserCount() > 0) {
    return res.status(409).json({ error: req.t('backend.auth.initExists') });
  }

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username.length < 3) {
    return res.status(400).json({ error: req.t('backend.auth.usernameTooShort') });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: req.t('backend.auth.passwordTooShort') });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // Re-check after the async hash: two concurrent bootstrap requests must not both create an admin.
  if (getUserCount() > 0) {
    return res.status(409).json({ error: req.t('backend.auth.initExists') });
  }

  const user = createUser(username, passwordHash, 'admin');
  migrateLegacyDataToUser(user.id);
  return startSession(req, res, user.id, () => ({ ok: true, user: sanitizeUser(user) }));
});

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const client = req.ip || 'unknown';

  const retryAfter = loginLimiter.retryAfter(client, username);
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: req.t('backend.auth.tooManyAttempts', { minutes: Math.ceil(retryAfter / 60) }) });
  }

  const user = getUserAuthByUsername(username);
  const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !matches) {
    loginLimiter.recordFailure(client, username);
    return res.status(401).json({ error: req.t('backend.auth.invalid') });
  }

  loginLimiter.recordSuccess(client, username);
  return startSession(req, res, user.id, () => ({ ok: true, user: sanitizeUser(getUserById(user.id)) }));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('discographic.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: sanitizeUser(getCurrentUser(req)) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (newPassword.length < 8) {
    return res.status(400).json({ error: req.t('backend.auth.passwordTooShort') });
  }

  const user = getUserAuthById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: req.t('backend.auth.required') });
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    return res.status(400).json({ error: req.t('backend.auth.currentPasswordInvalid') });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  updateUserPasswordHash(user.id, passwordHash);
  return res.json({ ok: true, message: req.t('backend.auth.passwordChanged') });
});

export default router;
