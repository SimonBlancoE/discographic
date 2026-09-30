import express, { type Request, type Response, type NextFunction } from 'express';
import { errorMessage } from './services/errors.js';
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
import radarRouter from './routes/radar.js';
import statsRouter from './routes/stats.js';
import syncRouter from './routes/sync.js';
import { resolveRuntimePaths } from './runtimePaths.js';
import { resolveSessionSecret, resolveTrustProxy, securityHeaders } from './middleware/security.js';
import { resolveLocale, translate } from '../shared/i18n.js';

const { dataDir, distDir } = resolveRuntimePaths(import.meta.url);
const app = express();
const port = Number(process.env.PORT || 3800);
const SqliteStore = connectSqlite3(session);
const cookieSecure = process.env.COOKIE_SECURE === 'true';

app.disable('x-powered-by');
app.set('trust proxy', resolveTrustProxy(process.env, cookieSecure));
app.use(securityHeaders);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// Express 5 leaves req.body undefined when no parser ran (e.g. body-less POSTs); routes read fields from it.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});
app.use((req, res, next) => {
  req.locale = resolveLocale(req.query?.locale || req.headers['accept-language']);
  req.t = (key, vars) => translate(req.locale, key, vars);
  next();
});

app.use(
  session({
    name: 'discographic.sid',
    secret: resolveSessionSecret(dataDir),
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
app.use('/api/radar', radarRouter);
app.use('/api/collection', collectionRouter);
app.use('/api/sync', syncRouter);
app.use('/api/export', exportRouter);
app.use('/api/import', importRouter);
app.use('/api/media', mediaRouter);

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // Express 5 (path-to-regexp v8) requires named wildcards.
  app.get('/{*splat}', (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: errorMessage(err) || req.t('backend.server.internal') });
});

app.listen(port, () => {
  console.log(`Discographic listening on http://localhost:${port}`);
});
