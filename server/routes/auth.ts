import { record } from '../discogsPagination.js';
import bcrypt from 'bcryptjs';
import express from 'express';
import type { Request, Response } from 'express';
import { normalizeAuthStatus, normalizeUser } from '../../shared/contracts/account.js';
import { createUser, getUserAuthById, getUserAuthByUsername, getUserCount, getUserById, migrateLegacyDataToUser, updateUserPasswordHash } from '../db.js';
import { getCurrentUser, requireAuth } from '../middleware/auth.js';
import { createLoginLimiter } from '../middleware/security.js';

const router = express.Router();
const loginLimiter = createLoginLimiter();
// Compared against when the username does not exist, so both paths cost one bcrypt check.
const DUMMY_HASH = bcrypt.hashSync('discographic-timing-guard', 12);

// A fresh session id on every login prevents session fixation.
function startSession(req: Request, res: Response, userId: number, authEpoch: number, payload: () => unknown) {
  return req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      return res.status(500).json({ error: req.t('backend.auth.session') });
    }

    const currentUser = getUserAuthById(userId);
    if (!currentUser || currentUser.auth_epoch !== authEpoch) {
      return res.status(401).json({ error: req.t('backend.auth.invalid') });
    }

    req.session.userId = userId;
    req.session.authEpoch = authEpoch;
    return req.session.save((error) => {
      if (error) {
        return res.status(500).json({ error: req.t('backend.auth.session') });
      }

      return res.json(payload());
    });
  });
}

function sanitizeUser(user: unknown) {
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
  const body = record(req.body) ?? {};
  if (getUserCount() > 0) {
    return res.status(409).json({ error: req.t('backend.auth.initExists') });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');

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
  return startSession(req, res, user.id, user.auth_epoch, () => ({ ok: true, user: sanitizeUser(user) }));
});

router.post('/login', async (req, res) => {
  const body = record(req.body) ?? {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const client = req.ip || 'unknown';

  const admission = loginLimiter.reserve(client, username);
  if (!admission.allowed) {
    res.setHeader('Retry-After', String(admission.retryAfter));
    return res.status(429).json({ error: req.t('backend.auth.tooManyAttempts', { minutes: Math.ceil(admission.retryAfter / 60) }) });
  }

  let success = false;
  try {
    const user = getUserAuthByUsername(username);
    const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    // Credentials may have changed while the asynchronous comparison was running.
    const currentUser = user ? getUserAuthById(user.id) : null;
    if (!user || !matches || !currentUser || currentUser.auth_epoch !== user.auth_epoch || currentUser.password_hash !== user.password_hash) {
      return res.status(401).json({ error: req.t('backend.auth.invalid') });
    }

    success = true;
    return startSession(req, res, user.id, user.auth_epoch, () => ({ ok: true, user: sanitizeUser(getUserById(user.id)) }));
  } finally {
    admission.finish(success);
  }
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
  const body = record(req.body) ?? {};
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (newPassword.length < 8) {
    return res.status(400).json({ error: req.t('backend.auth.passwordTooShort') });
  }

  const user = getUserAuthById(req.session.userId!);
  if (!user) {
    return res.status(404).json({ error: req.t('backend.auth.required') });
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    return res.status(400).json({ error: req.t('backend.auth.currentPasswordInvalid') });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // A reset during either bcrypt operation must not be overwritten by this stale request.
  const updatedUser = updateUserPasswordHash(user.id, passwordHash, user.auth_epoch);
  if (!updatedUser) {
    return res.status(401).json({ error: req.t('backend.auth.required') });
  }
  return startSession(req, res, user.id, updatedUser.auth_epoch, () => ({ ok: true, message: req.t('backend.auth.passwordChanged') }));
});

export default router;
