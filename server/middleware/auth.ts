import type { NextFunction, Request, Response } from 'express';
import { createDiscogsClient } from '../discogs.js';
import { createUserJobScope } from '../services/userJobs.js';
import { getDiscogsAccount, getUserById } from '../db.js';

export function getCurrentUser(req: Request) {
  if (!req.session?.userId || !Number.isSafeInteger(req.session.authEpoch)) {
    return null;
  }

  const user = getUserById(req.session.userId);
  return user && user.auth_epoch === req.session.authEpoch ? user : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getCurrentUser(req)) {
    return res.status(401).json({ error: req.t('backend.auth.required') });
  }

  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: req.t('backend.auth.required') });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: req.t('backend.auth.adminRequired') });
  }

  return next();
}

function requireDiscogsAccount(req: Request) {
  const account = getDiscogsAccount(req.session.userId);
  if (!account) {
    throw new Error(req.t('backend.auth.configureDiscogs'));
  }
  return account;
}

export function getDiscogsClientForUser(req: Request) {
  const account = requireDiscogsAccount(req);
  return createDiscogsClient({
    token: account.discogs_token,
    username: account.discogs_username,
    signal: createUserJobScope(req.session.userId!).signal
  });
}
