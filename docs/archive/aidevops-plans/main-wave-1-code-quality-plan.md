# Main Branch Wave 1 Code Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create three focused PRs targeting `main` for low-risk code-quality cleanup identified in the main branch audit.

**Architecture:** Each fix is isolated on its own branch from `origin/main`. Static analysis or focused tests are run before changes to establish the red/baseline signal, then implementation is verified with focused checks, full tests, and build.

**Tech Stack:** Node.js, Express, React, Vite, Vitest, knip, GitHub CLI.

---

## Task 1: Unused Exports Cleanup PR

**Files:**
- Modify: `server/db.js`
- Modify: `server/services/coverMedia.js`
- Modify: `src/lib/importSync.js`
- Modify: `src/lib/wallGrid.js`
- Modify: `server/middleware/auth.js`
- Modify: `src/lib/releaseEdits.js`

- [ ] Run `npx --yes knip --reporter json` to verify current unused export findings.
- [ ] Remove `getUserByUsername`.
- [ ] Make internal-only constants/helpers non-exported while preserving behavior.
- [ ] Run `npx --yes knip --reporter json`, `npm test`, and `npm run build`.
- [ ] Commit and create PR targeting `main`.

## Task 2: Export Image DRY Cleanup PR

**Files:**
- Modify: `src/lib/exportImage.js`

- [ ] Run `npx --yes jscpd src/lib/exportImage.js --format javascript --min-lines 8 --min-tokens 50 --reporters console` to verify duplication.
- [ ] Extract shared download helpers for Blob and data URL downloads.
- [ ] Run focused duplication check, `npm test`, and `npm run build`.
- [ ] Commit and create PR targeting `main`.

## Task 3: Comment and Copy Cleanup PR

**Files:**
- Modify: `shared/i18n.js`
- Modify: `src/components/VinylBadge.jsx`
- Modify: `tests/vinyl-badge.test.js`
- Modify: `tests/i18n-columns.test.js`
- Modify comments in `server/routes/import.js`, `src/components/ImportButton.jsx`, `server/routes/collection.js`, `server/routes/sync.js` if safe and concise.

- [ ] Write failing tests for neutral VinylBadge fallback and dashboard coverage copy that no longer references implementation history.
- [ ] Run focused tests and verify failure.
- [ ] Replace fake genre fallback with neutral label/swatch state.
- [ ] Replace dashboard implementation-history copy.
- [ ] Remove decorative comments that only label obvious sections.
- [ ] Run focused tests, full tests, and build.
- [ ] Commit and create PR targeting `main`.
