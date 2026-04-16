import bcrypt from 'bcryptjs';
import express from 'express';
import { createUser, getUserAuthById, getUserAuthByUsername, getUserCount, getUserById, updateUserPasswordHash } from '../db.js';
import { serializeUser as sanitizeUser } from '../lib/userView.js';
import { getCurrentUser, requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', (req, res) => {
  const user = getCurrentUser(req);
  res.json({
    needsBootstrap: getUserCount() === 0,
    loggedIn: Boolean(user),
    user: sanitizeUser(user)
  });
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
  const user = createUser(username, passwordHash, 'admin');
  req.session.userId = user.id;

  return req.session.save((error) => {
    if (error) {
      return res.status(500).json({ error: req.t('backend.auth.session') });
    }

    return res.json({ ok: true, user: sanitizeUser(user) });
  });
});

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = getUserAuthByUsername(username);

  if (!user) {
    return res.status(401).json({ error: req.t('backend.auth.invalid') });
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: req.t('backend.auth.invalid') });
  }

  req.session.userId = user.id;
  return req.session.save((error) => {
    if (error) {
      return res.status(500).json({ error: req.t('backend.auth.session') });
    }

    return res.json({ ok: true, user: sanitizeUser(getUserById(user.id)) });
  });
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
