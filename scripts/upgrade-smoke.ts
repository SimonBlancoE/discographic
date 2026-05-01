import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { resolveDockerSmokePlan } from './upgradeSmokePolicy.js';

type LegacyFixture = {
  tempRoot: string;
  dataDir: string;
  cachedCoverPath: string;
};

type SessionState = {
  cookie: string | null;
};

type RequestResult = {
  status: number;
  headers: Headers;
  text: string;
  buffer: Buffer;
  json: unknown;
};

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distStartPath = join(projectRoot, 'dist', 'server', 'start.js');
const legacyPassword = 'legacy12345';
const legacyUsername = 'legacy-admin';
const skipDocker = process.env.DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER === 'true';
const requireDocker = process.env.DISCOGRAPHIC_UPGRADE_SMOKE_REQUIRE_DOCKER === 'true';

type DockerAvailability = {
  availableOnPath: boolean;
  daemonReachable: boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCommand(command: string, args: string[], label: string): string {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed with exit code ${result.status}${output ? `\n${output}` : ''}`);
  }

  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function runCommandAllowFailure(command: string, args: string[]): void {
  spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function getDockerAvailability(): DockerAvailability {
  const versionResult = spawnSync('docker', ['--version'], { encoding: 'utf8' });
  if (versionResult.status !== 0) {
    return {
      availableOnPath: false,
      daemonReachable: false,
    };
  }

  return {
    availableOnPath: true,
    daemonReachable: spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0,
  };
}

function ensureBuildArtifacts(): void {
  assert(existsSync(distStartPath), 'Missing dist/server/start.js. Run `npm run build` before `npm run test:upgrade-smoke`.');
}

async function getAvailablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not determine an available port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

async function createLegacyFixture(): Promise<LegacyFixture> {
  const tempRoot = mkdtempSync(join(tmpdir(), 'discographic-upgrade-smoke-'));
  const dataDir = join(tempRoot, 'data');
  const dbPath = join(dataDir, 'discographic.db');
  const cachedCoverPath = join(dataDir, 'covers', '1', '1-wall.jpg');

  mkdirSync(join(dataDir, 'covers', '1'), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE discogs_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      discogs_username TEXT NOT NULL,
      discogs_token TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      release_id INTEGER NOT NULL,
      instance_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      year INTEGER,
      genres TEXT,
      styles TEXT,
      formats TEXT,
      labels TEXT,
      country TEXT,
      cover_url TEXT,
      rating INTEGER DEFAULT 0,
      notes TEXT,
      date_added TEXT,
      estimated_value REAL,
      marketplace_status TEXT DEFAULT 'pending',
      listing_status TEXT DEFAULT NULL,
      listing_price REAL DEFAULT NULL,
      listing_currency TEXT DEFAULT NULL,
      listing_price_eur REAL DEFAULT NULL,
      last_seen_sync_id INTEGER DEFAULT NULL,
      tracklist TEXT,
      folder_id INTEGER DEFAULT 0,
      raw_json TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, instance_id)
    );

    CREATE TABLE sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      started_at TEXT,
      finished_at TEXT,
      records_synced INTEGER,
      status TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE settings (
      user_id INTEGER,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const passwordHash = await bcrypt.hash(legacyPassword, 12);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(1, legacyUsername, passwordHash, 'admin', '2026-04-20T08:00:00Z');

  db.prepare(`
    INSERT INTO discogs_accounts (user_id, discogs_username, discogs_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(1, 'legacydiscogs', 'legacy-token-1234567890', '2026-04-20T08:05:00Z', '2026-04-25T14:15:00Z');

  db.prepare(`
    INSERT INTO settings (user_id, key, value)
    VALUES (?, ?, ?), (?, ?, ?)
  `).run(
    1,
    'currency',
    'USD',
    1,
    'collection_visible_columns',
    JSON.stringify(['cover', 'artist', 'title', 'year', 'estimated_value'])
  );

  db.prepare(`
    INSERT INTO releases (
      id, user_id, release_id, instance_id, title, artist, year, genres, styles, formats,
      labels, country, cover_url, rating, notes, date_added, estimated_value, marketplace_status,
      listing_status, listing_price, listing_currency, listing_price_eur, last_seen_sync_id,
      tracklist, folder_id, raw_json, synced_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    ), (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    1,
    1,
    101,
    1001,
    'Music Has the Right to Children',
    'Boards of Canada',
    1998,
    JSON.stringify(['Electronic']),
    JSON.stringify(['IDM']),
    JSON.stringify([{ name: 'Vinyl' }]),
    JSON.stringify([{ name: 'Warp Records' }]),
    'UK',
    'https://invalid.example/cached-cover.jpg',
    5,
    JSON.stringify([{ field_id: 3, value: 'Legacy note survives the upgrade' }]),
    '2026-03-01T10:00:00Z',
    34.5,
    'priced',
    'For Sale',
    29.99,
    'USD',
    27.4,
    42,
    JSON.stringify([{ position: 'A1', title: 'Wildlife Analysis' }]),
    0,
    JSON.stringify({ formats: ['Vinyl'], source: 'legacy-js-release' }),
    '2026-04-20T09:00:00Z',
    2,
    1,
    202,
    1002,
    'Selected Ambient Works 85-92',
    'Aphex Twin',
    1992,
    JSON.stringify(['Electronic']),
    JSON.stringify(['Ambient']),
    JSON.stringify([{ name: 'Vinyl' }]),
    JSON.stringify([{ name: 'Apollo' }]),
    'UK',
    'https://invalid.example/pending-cover.jpg',
    0,
    JSON.stringify([]),
    '2026-03-05T12:30:00Z',
    0,
    'pending',
    null,
    null,
    null,
    null,
    null,
    JSON.stringify([]),
    0,
    JSON.stringify({ formats: ['Vinyl'], source: 'legacy-js-release' }),
    '2026-04-20T09:10:00Z'
  );

  db.prepare(`
    INSERT INTO sync_log (user_id, started_at, finished_at, records_synced, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(1, '2026-04-25T13:00:00Z', '2026-04-25T13:03:00Z', 2, 'completed');

  db.close();

  await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(cachedCoverPath);

  return { tempRoot, dataDir, cachedCoverPath };
}

function cleanupFixture(fixture: LegacyFixture): void {
  rmSync(fixture.tempRoot, { recursive: true, force: true });
}

function startManagedProcess(command: string, args: string[], env: NodeJS.ProcessEnv): {
  child: ChildProcess;
  getLogs: () => string;
} {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';

  child.stdout?.on('data', (chunk: Buffer | string) => {
    logs += String(chunk);
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    logs += String(chunk);
  });

  return {
    child,
    getLogs: () => logs.trim(),
  };
}

async function stopManagedProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });

    child.kill('SIGTERM');
  });
}

async function request(baseUrl: string, path: string, session: SessionState, init: RequestInit & { json?: unknown } = {}): Promise<RequestResult> {
  const headers = new Headers(init.headers);

  if (session.cookie) {
    headers.set('Cookie', session.cookie);
  }

  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    body,
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    session.cookie = setCookie.split(';', 1)[0] ?? null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  const contentType = response.headers.get('content-type') || '';
  const json = contentType.includes('application/json') && text ? JSON.parse(text) : null;

  return {
    status: response.status,
    headers: response.headers,
    text,
    buffer,
    json,
  };
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const session = { cookie: null };

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await request(baseUrl, '/api/health', session);
      if (response.status === 200 && (response.json as { ok?: boolean } | null)?.ok === true) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(`Service did not become healthy at ${baseUrl}/api/health`);
}

function verifyPostUpgradeDbState(fixture: LegacyFixture): void {
  const db = new Database(join(fixture.dataDir, 'discographic.db'), { readonly: true });
  const pendingRow = db
    .prepare<[number], { estimated_value: number | null; marketplace_status: string }>(`
      SELECT estimated_value, marketplace_status
      FROM releases
      WHERE id = ?
    `)
    .get(2);
  db.close();

  assert(pendingRow, 'Expected migrated pending release row to exist');
  assert(pendingRow.estimated_value === null, 'Expected legacy zero estimated value to be normalized to NULL');
  assert(pendingRow.marketplace_status === 'pending', 'Expected pending marketplace status to be preserved');
}

function getJsonRecord(value: unknown, label: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), `Expected ${label} JSON object response`);
  return value as Record<string, unknown>;
}

async function assertLegacyAppBehavior(baseUrl: string, cachedCoverPath: string, label: string): Promise<void> {
  const session: SessionState = { cookie: null };

  const health = await request(baseUrl, '/api/health', session);
  assert(health.status === 200, `${label}: expected /api/health to return 200`);
  assert((health.json as { ok?: boolean } | null)?.ok === true, `${label}: expected /api/health to report ok=true`);

  const index = await request(baseUrl, '/', session);
  assert(index.status === 200, `${label}: expected / to return 200`);
  assert(index.text.includes('<div id="root"></div>'), `${label}: expected compiled frontend HTML to be served from /`);

  const login = await request(baseUrl, '/api/auth/login', session, {
    method: 'POST',
    json: {
      username: legacyUsername,
      password: legacyPassword,
    },
  });
  assert(login.status === 200, `${label}: expected login to return 200, got ${login.status}`);
  assert(Boolean(session.cookie), `${label}: expected login to establish a session cookie`);

  const account = getJsonRecord((await request(baseUrl, '/api/account', session)).json, `${label} account`);
  assert(account.discogsUsername === 'legacydiscogs', `${label}: expected Discogs username to survive upgrade`);
  assert(account.tokenConfigured === true, `${label}: expected Discogs token to remain configured`);
  assert(account.tokenPreview === 'lega...7890', `${label}: expected Discogs token preview to be masked consistently`);
  assert(account.currency === 'USD', `${label}: expected account currency preference to survive upgrade`);

  const currencyPreference = getJsonRecord((await request(baseUrl, '/api/account/preferences/currency', session)).json, `${label} currency preference`);
  assert(currencyPreference.value === 'USD', `${label}: expected currency preference to be readable`);

  const columnPreference = getJsonRecord((await request(baseUrl, '/api/account/preferences/collection_visible_columns', session)).json, `${label} column preference`);
  assert(
    columnPreference.value === '["cover","artist","title","year","estimated_value"]',
    `${label}: expected collection column preference to survive upgrade`
  );

  const collection = getJsonRecord((await request(baseUrl, '/api/collection?limit=10', session)).json, `${label} collection`);
  const releases = Array.isArray(collection.releases) ? collection.releases : [];
  assert(releases.length === 2, `${label}: expected collection API to return the seeded legacy releases`);
  const releaseTitles = new Set(
    releases
      .map((release) => (release && typeof release === 'object' ? (release as Record<string, unknown>).title : null))
      .filter((title): title is string => typeof title === 'string')
  );
  assert(releaseTitles.has('Music Has the Right to Children'), `${label}: expected collection to include cached-cover release`);
  assert(releaseTitles.has('Selected Ambient Works 85-92'), `${label}: expected collection to include pending release`);

  const stats = getJsonRecord((await request(baseUrl, '/api/stats', session)).json, `${label} stats`);
  const totals = getJsonRecord(stats.totals, `${label} stats totals`);
  assert(totals.total_records === 2, `${label}: expected dashboard totals.total_records=2`);
  assert(totals.priced_records === 1, `${label}: expected dashboard totals.priced_records=1`);
  assert(totals.value_pending_records === 1, `${label}: expected dashboard totals.value_pending_records=1`);
  assert(totals.notes_records === 1, `${label}: expected dashboard totals.notes_records=1`);
  assert(stats.displayCurrency === 'USD', `${label}: expected dashboard displayCurrency=USD`);
  assert(getJsonRecord(stats.lastSync, `${label} lastSync`).status === 'completed', `${label}: expected last sync status to survive upgrade`);

  const cachedCoverResponse = await request(baseUrl, '/api/media/cover/1?variant=wall', session);
  const cachedCoverBytes = readFileSync(cachedCoverPath);
  assert(cachedCoverResponse.status === 200, `${label}: expected cached cover route to return 200`);
  assert(
    cachedCoverResponse.headers.get('content-type') === 'image/jpeg',
    `${label}: expected cached cover route to return image/jpeg`
  );
  assert(
    cachedCoverResponse.buffer.equals(cachedCoverBytes),
    `${label}: expected cached cover bytes to be reused without fetching a remote image`
  );
}

async function runCompiledStartSmoke(): Promise<void> {
  const fixture = await createLegacyFixture();
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const runtime = startManagedProcess('node', [distStartPath], {
    ...process.env,
    PORT: String(port),
    SESSION_SECRET: 'discographic-upgrade-smoke',
    COOKIE_SECURE: 'false',
    DISCOGRAPHIC_DATA_DIR: fixture.dataDir,
  });
  let failure: Error | null = null;

  try {
    await waitForHealth(baseUrl);
    await assertLegacyAppBehavior(baseUrl, fixture.cachedCoverPath, 'compiled runtime');
  } catch (error) {
    const details = runtime.getLogs();
    failure = new Error(`${(error as Error).message}${details ? `\n\nServer output:\n${details}` : ''}`);
  } finally {
    await stopManagedProcess(runtime.child);
    try {
      verifyPostUpgradeDbState(fixture);
    } catch (error) {
      failure = failure
        ? new Error(`${failure.message}\n\nPost-upgrade DB verification failed: ${(error as Error).message}`)
        : (error as Error);
    }
    cleanupFixture(fixture);
  }

  if (failure) {
    throw failure;
  }
}

async function runDockerSmoke(): Promise<void> {
  const fixture = await createLegacyFixture();
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const imageTag = `discographic-upgrade-smoke:${Date.now()}`;
  const containerName = `discographic-upgrade-smoke-${process.pid}-${Date.now()}`;
  let failure: Error | null = null;

  try {
    runCommand('docker', ['build', '-t', imageTag, '.'], 'docker build');
    runCommand(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--publish',
        `127.0.0.1:${port}:3800`,
        '--env',
        'PORT=3800',
        '--env',
        'SESSION_SECRET=discographic-upgrade-smoke',
        '--env',
        'COOKIE_SECURE=false',
        '--volume',
        `${resolve(fixture.dataDir)}:/app/data`,
        imageTag,
      ],
      'docker run'
    );

    await waitForHealth(baseUrl);
    await assertLegacyAppBehavior(baseUrl, fixture.cachedCoverPath, 'docker runtime');
  } catch (error) {
    failure = error as Error;
  } finally {
    runCommandAllowFailure('docker', ['rm', '-f', containerName]);
    runCommandAllowFailure('docker', ['image', 'rm', imageTag]);
    try {
      verifyPostUpgradeDbState(fixture);
    } catch (error) {
      failure = failure
        ? new Error(`${failure.message}\n\nPost-upgrade DB verification failed: ${(error as Error).message}`)
        : (error as Error);
    }
    cleanupFixture(fixture);
  }

  if (failure) {
    throw failure;
  }
}

async function main(): Promise<void> {
  ensureBuildArtifacts();
  console.log('Running compiled-runtime upgrade smoke against legacy v0.2.2 data fixture...');
  await runCompiledStartSmoke();
  console.log('Compiled-runtime upgrade smoke passed.');

  const dockerAvailability = getDockerAvailability();
  const dockerPlan = resolveDockerSmokePlan({
    skipDocker,
    requireDocker,
    dockerAvailableOnPath: dockerAvailability.availableOnPath,
    dockerDaemonReachable: dockerAvailability.daemonReachable,
  });

  if (dockerPlan.action === 'skip') {
    console.log(dockerPlan.message);
    return;
  }

  if (dockerPlan.action === 'error') {
    throw new Error(dockerPlan.message);
  }

  console.log('Running Docker upgrade smoke against legacy v0.2.2 data fixture...');
  await runDockerSmoke();
  console.log('Docker upgrade smoke passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
