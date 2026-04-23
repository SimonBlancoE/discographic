<div align="center">

# Discographic

**A self-hosted command center for your vinyl collection.**

Sync your Discogs records, explore stats, rate and annotate everything, and export posters or spreadsheets from a single app that runs on your machine or server.

**Spanish version:** [Leer en español](./README.es.md)

> `README.md` is the canonical version. Any content change here should be mirrored in `README.es.md` within the same PR.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg?logo=docker&logoColor=white)](https://docs.docker.com/get-docker/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/database-SQLite-003B57.svg?logo=sqlite&logoColor=white)](https://www.sqlite.org/)

<br />
<br />

<img src="docs/screenshots/dashboard-hero.webp" alt="Discographic dashboard with charts and collection stats" width="900" />

<br />
<br />

*Built for collectors who want a fast, personal dashboard for their record library.*

</div>

> [!NOTE]
> **v0.2.0 is out** - dashboard and cover wall performance, sync reconciliation, localized imports, and a broad shared-module refactor. See [CHANGELOG.en.md](CHANGELOG.en.md) for the full list.

## What is it?

Discographic is a self-hosted web app for browsing and managing your Discogs collection in a way that actually feels useful day to day.

Instead of just showing a raw list of releases, it gives you a proper dashboard, a searchable collection browser, a visual cover wall, exports, notes, ratings, and a local cache so the app stays fast once your library is synced. It works well for a solo collector, and it also makes sense for a small group of friends sharing the same instance.

## Why use it?

- **Your data stays with you** - everything is cached locally in SQLite.
- **Easy to run** - Docker Compose and you're in.
- **Built for collectors, not just CRUD** - charts, value tracking, filters, notes, exports, poster generation.
- **Spanish and English UI** - the app is bilingual.
- **Multi-user ready** - each user connects their own Discogs account and sees only their own collection.

## A quick look

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/collection.webp" alt="Collection browser with filters and inline editing" width="100%" />
      <p><strong>Collection browser</strong><br />Search, filter, sort, rate, annotate, and export your records.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/wall.webp" alt="Cover wall and poster generator" width="100%" />
      <p><strong>Cover wall</strong><br />Turn your collection into a visual wall or high-resolution poster.</p>
    </td>
  </tr>
</table>

## What you get

- **Dashboard** - collection totals, estimated value, charts, leaderboard views.
- **Collection browser** - search, filters, sorting, inline ratings, and notes.
- **Release detail pages** - tracklist, metadata, and PNG export.
- **Cover wall** - seamless poster generation up to 7200px.
- **Import / Export** - Excel and CSV support.
- **Achievements** - tiered unlockables and hidden badges.
- **Random picker** - for when you want the app to choose tonight's record.

## Quick start

If you just want to run it, this is the path.

### 1. Start with Docker

You need [Docker](https://docs.docker.com/get-docker/) installed.

```bash
git clone https://github.com/SimonBlancoE/discographic.git
cd discographic
docker compose up -d
```

Then open **http://localhost:3800** in your browser.

### Ephemeral manual test instance

If you want a throwaway instance for QA with seeded users and no persistent data:

```bash
npm run test:instance:start -- --host 127.0.0.1 --port 3801
```

That command starts a disposable Docker instance with these users already created:

- **Admin** - `admin-demo` / `demo12345`
- **User** - `user-demo` / `demo12345`

All data lives in memory only. When you finish testing, destroy everything with:

```bash
npm run test:instance:stop -- --host 127.0.0.1 --port 3801
```

### 2. Create your first user

On first launch, Discographic will ask you to create an admin account.

### 3. Connect your Discogs account

After signing in:

1. Open **Settings**
2. Enter your Discogs username
3. Paste your personal access token
4. Run **Sync with Discogs**

### 4. Get your Discogs token

1. Go to [discogs.com/settings/developers](https://www.discogs.com/settings/developers)
2. Click **Generate new token**
3. Copy it into Discographic

That's all the app needs to read your collection and sync things like ratings and notes back to Discogs.

### Stop or restart it later

```bash
docker compose down
docker compose up -d
```

Your data stays in the Docker volume.

### Updating to a new version

```bash
git pull
docker compose up -d --build
```

Your database and cached covers are preserved - they live in a Docker volume separate from the image. If the new version needs changes to the database, they are applied automatically on startup.

## Local development

If you want to work on the code instead of just running the app:

```bash
npm install
```

You need two terminals:

```bash
# Terminal 1 - API server
npm run server

# Terminal 2 - Vite dev server with hot reload
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3800

### Environment variables

Copy `.env.example` to `.env` if you want to override the defaults:

```env
HOST_IP=127.0.0.1                         # Docker bind IP (use your LAN IP to expose it)
PORT=3800                                 # API port
SESSION_SECRET=change-this-in-production  # Cookie signing secret
COOKIE_SECURE=false                       # Set to true behind HTTPS
```

Discogs credentials are **not** set via environment variables. Each user adds them inside the app.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| Charts | Recharts |
| Image processing | Sharp |
| Packaging | Docker multi-stage build |

## Project structure

```text
src/          React frontend (pages, components, hooks, context)
server/       Express API, SQLite setup, Discogs client, route handlers
shared/       i18n strings and utilities shared between frontend and backend
public/       Static assets
data/         Runtime data - SQLite DB and cached covers (gitignored)
docs/         README screenshots
```

## Troubleshooting

**`better-sqlite3` or `sharp` fails to install**

Both packages use native binaries. On Linux you may need `build-essential` and `python3`. On macOS, install Xcode command line tools. The Docker image avoids this problem entirely.

**Port 3800 is already in use**

Change the port in `.env` or in `docker-compose.yml`.

**First sync takes a while**

That is normal for larger collections. Discogs rate-limits API calls, so the initial sync can take several minutes. Later syncs are much faster.

**Covers are slow the first time**

Cover thumbnails are cached locally. The first wall/poster run is the slow one; after that it gets much faster.

## License

[MIT](LICENSE)
