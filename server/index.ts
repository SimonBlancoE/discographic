// @ts-nocheck
import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'better-sqlite3-session-store';
import { existsSync } from 'fs';
import { join } from 'path';
import db from './db.js';
import accountRouter from './routes/account.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import collectionRouter from './routes/collection.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';
import mediaRouter from './routes/media.js';
import statsRouter from './routes/stats.js';
import syncRouter from './routes/sync.js';
import { resolveRuntimePaths } from './runtimePaths.js';
import { resolveLocale, translate } from '../shared/i18n.js';

const { distDir } = resolveRuntimePaths(import.meta.url);
const app = express();
const port = Number(process.env.PORT || 3800);
const SqliteStore = connectSqlite3(session);
const cookieSecure = process.env.COOKIE_SECURE === 'true';

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.locale = resolveLocale(req.query?.locale || req.headers['accept-language']);
  req.t = (key, vars) => translate(req.locale, key, vars);
  next();
});

app.use(
  session({
    name: 'discographic.sid',
    secret: process.env.SESSION_SECRET || 'discographic-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 14
    },
    store: new SqliteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 1000 * 60 * 15
      }
    })
  })
);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stats', statsRouter);
app.use('/api/collection', collectionRouter);
app.use('/api/sync', syncRouter);
app.use('/api/export', exportRouter);
app.use('/api/import', importRouter);
app.use('/api/media', mediaRouter);

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || req.t('backend.server.internal') });
});

app.listen(port, () => {
  console.log(`Discographic listening on http://localhost:${port}`);
});
