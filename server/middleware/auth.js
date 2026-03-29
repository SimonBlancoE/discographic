import { createDiscogsClient } from '../discogs.js';
import { getDiscogsAccount, getUserById } from '../db.js';

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: req.t('backend.auth.required') });
  }

  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: req.t('backend.auth.required') });
  }

  const user = getUserById(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: req.t('backend.auth.adminRequired') });
  }

  return next();
}

export function getCurrentUser(req) {
  if (!req.session?.userId) {
    return null;
  }

  return getUserById(req.session.userId);
}

export function requireDiscogsAccount(req) {
  const account = getDiscogsAccount(req.session.userId);
  if (!account) {
    throw new Error(req.t('backend.auth.configureDiscogs'));
  }
  return account;
}

export function getDiscogsClientForUser(req) {
  const account = requireDiscogsAccount(req);
  return createDiscogsClient({
    token: account.discogs_token,
    username: account.discogs_username
  });
}
