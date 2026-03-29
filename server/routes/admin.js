import bcrypt from 'bcryptjs';
import express from 'express';
import { createUser, deleteUser, getUserById, listUsers } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/users', (req, res) => {
  const users = listUsers().map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at
  }));

  res.json({ users });
});

router.post('/users', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username.length < 3) {
    return res.status(400).json({ error: req.t('backend.admin.usernameLength') });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: req.t('backend.admin.passwordLength') });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser(username, passwordHash);
    return res.json({ ok: true, user });
  } catch (error) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: req.t('backend.admin.usernameExists') });
    }
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.session.userId) {
    return res.status(400).json({ error: req.t('backend.admin.selfDelete') });
  }

  const target = getUserById(targetId);
  if (!target) {
    return res.status(404).json({ error: req.t('backend.admin.userNotFound') });
  }

  deleteUser(targetId);
  return res.json({ ok: true });
});

export default router;
