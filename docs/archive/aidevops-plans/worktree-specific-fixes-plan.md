# Worktree-Specific Code Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create four focused PRs targeting `fix/project-improvement-design-plans` that address worktree-specific audit findings.

**Architecture:** Each fix is isolated on its own branch created from `fix/project-improvement-design-plans`. Tests are written first and verified red before implementation. Each branch gets one commit and one PR.

**Tech Stack:** Node.js, Express, React, shared JavaScript contract modules, Vitest, GitHub CLI.

---

## Task 1: Shared Marketplace Contract PR

**Files:**
- Create: `shared/contracts/marketplace.js`
- Modify: `server/services/marketplaceValue.js`
- Modify: `server/services/enrichmentQueue.js`
- Modify: `server/services/dbMigrations.js`
- Modify: `server/routes/collection.js`
- Modify: `server/routes/stats.js`
- Modify: `server/routes/sync.js`
- Modify: `src/components/CollectionTable.jsx`
- Modify tests importing marketplace status.

- [ ] Write failing tests for shared marketplace constants and label keys.
- [ ] Run the marketplace contract test and verify failure.
- [ ] Implement shared contract and update imports.
- [ ] Replace hard-coded React `'priced'` check with shared constant/helper.
- [ ] Run focused tests and build.
- [ ] Commit and create PR targeting `fix/project-improvement-design-plans`.

## Task 2: I18n Price Status Key Coverage PR

**Files:**
- Modify: `tests/i18n-columns.test.js`

- [ ] Write failing test for the four new price-status labels in both locales.
- [ ] Run focused test and verify failure if the test expects explicit values not already asserted.
- [ ] Add/adjust assertions.
- [ ] Run focused tests.
- [ ] Commit and create PR targeting `fix/project-improvement-design-plans`.

## Task 3: Idempotent Legacy Zero-Value Cleanup PR

**Files:**
- Modify: `tests/marketplace-status-migration.test.js`
- Modify: `server/services/dbMigrations.js`

- [ ] Write failing migration test for an existing marketplace_status column with legacy zero values.
- [ ] Run focused test and verify failure.
- [ ] Update migration to null zero values idempotently without harming positive priced values.
- [ ] Run focused tests.
- [ ] Commit and create PR targeting `fix/project-improvement-design-plans`.

## Task 4: Marketplace Error Normalization PR

**Files:**
- Modify: `tests/marketplace-value.test.js`
- Modify: `server/services/marketplaceValue.js`

- [ ] Write failing test for non-Error thrown value from Discogs stats.
- [ ] Run focused test and verify failure.
- [ ] Add a safe error-message helper and use it for result + logging.
- [ ] Run focused tests.
- [ ] Commit and create PR targeting `fix/project-improvement-design-plans`.
