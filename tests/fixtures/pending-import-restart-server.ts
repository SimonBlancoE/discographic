// Fresh-process fixture: real HTTP routes, SQLite startup and Discogs client; only
// outbound HTTP is replaced. The parent test owns this temporary database and process.
import express from 'express';
import session from 'express-session';
import importRouter from '../../server/routes/import.js';
import { translate, type TranslationVars } from '../../shared/i18n.js';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://api.discogs.com') return originalFetch(input, init);
  if (init?.method !== 'POST' || !url.pathname.includes('/instances/')) throw new Error('Unexpected upstream operation');
  return new Response(null, { status: 204 });
};
const app = express(); app.use(express.json());
app.use(session({ secret: 'restart-fixture', resave: false, saveUninitialized: false }));
app.use((req, _res, next) => {
  req.session.userId = Number(req.get('x-test-user')); req.session.authEpoch = 0; req.locale = 'en';
  req.t = (key, vars) => translate('en', key, vars as TranslationVars); next();
});
app.use('/import', importRouter);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('bind');
  process.stdout.write(`READY http://127.0.0.1:${address.port}\n`);
});
