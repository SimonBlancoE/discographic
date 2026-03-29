# Discographic

A self-hosted dashboard for your Discogs vinyl collection. Sync your records, explore stats, rate and annotate everything, export posters and spreadsheets — all from a single app that runs on your machine or server.

Built for collectors who want a personal command center for their record library without depending on third-party services beyond Discogs itself.

## Why Discographic

- **Your data stays with you.** Everything is cached locally in SQLite. No cloud accounts, no subscriptions.
- **One command to run.** Docker Compose and you're up. No database servers, no external dependencies.
- **Actually useful stats.** Genre and decade breakdowns, format distribution, label rankings, growth over time, marketplace prices, artist leaderboards — not just a list of records.
- **Works in Spanish and English.** The entire UI switches between both languages, including backend messages.
- **Multi-user ready.** Each user connects their own Discogs account and sees only their own collection.

## What you get

- Dashboard with collection totals, estimated value, and interactive charts
- Full collection browser with search, filters, sorting, inline ratings, and notes
- Release detail pages with tracklist, metadata, and shareable PNG export
- Cover wall and seamless poster generator (up to 7200px)
- Excel/CSV import and export
- Achievement system with tiers and hidden unlockables
- Random record picker for when you don't know what to play

## Quick start with Docker

This is the easiest way to get Discographic running. You need [Docker](https://docs.docker.com/get-docker/) installed.

```bash
git clone https://github.com/SimonBlancoE/discographic.git
cd discographic
docker compose up -d
```

That's it. Open **http://localhost:3800** in your browser.

### First time setup

1. Discographic will ask you to **create an admin account** (just a username and password).
2. Sign in, then go to **Settings**.
3. Enter your **Discogs username** and **personal access token** (see below).
4. Hit **Sync with Discogs** and wait for your collection to download.

### Getting a Discogs token

1. Go to [discogs.com/settings/developers](https://www.discogs.com/settings/developers) (you need a Discogs account).
2. Click **Generate new token**.
3. Copy the token and paste it in Discographic's Settings page.

That's all Discographic needs. It uses this token to read your collection and sync changes like ratings and notes back to Discogs.

### Stopping and restarting

```bash
docker compose down     # stop
docker compose up -d    # start again — your data is preserved in a Docker volume
```

## Local development

If you want to hack on the code instead of just running it:

```bash
npm install
```

You need two terminals:

```bash
# Terminal 1 — API server
npm run server

# Terminal 2 — Vite dev server with hot reload
npm run dev
```

- Frontend: http://localhost:5173 (proxies API calls to the backend)
- Backend: http://localhost:3800

### Environment variables

Copy `.env.example` to `.env` if you want to override defaults:

```env
PORT=3800                                 # API port
SESSION_SECRET=change-this-in-production  # Cookie signing secret
COOKIE_SECURE=false                       # Set to true behind HTTPS
```

Discogs credentials are **not** set via environment variables — each user configures them inside the app.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| Charts | Recharts |
| Images | Sharp |
| Packaging | Docker (multi-stage build) |

## Project structure

```
src/          React frontend (pages, components, hooks, context)
server/       Express API, SQLite setup, Discogs client, route handlers
shared/       i18n strings and utilities shared between frontend and backend
public/       Static assets (favicon)
data/         Runtime data — SQLite DB, cached covers (gitignored)
```

## Troubleshooting

**`better-sqlite3` or `sharp` fails to install.**
Both packages include native binaries. On Linux you may need `build-essential` and `python3`. On macOS, Xcode command line tools. The Docker image handles this automatically.

**Port 3800 is already in use.**
Change the port in `.env` or in `docker-compose.yml` under `ports`.

**First sync takes a long time.**
This is normal for large collections. Discogs rate-limits API calls to 60/minute, so syncing 2000 records takes a few minutes. Subsequent syncs only fetch new additions.

**Covers are missing or slow to load.**
Cover thumbnails are cached locally on first access. The initial load of the cover wall or poster export may be slow; subsequent loads will be fast.

## License

[MIT](LICENSE)
