# Design Spec: Printable Catalog Export

**Date**: 2026-07-04  
**Author**: Antigravity  
**Status**: Approved  
**Topic**: High-density printable catalog with filter sync and optional GitHub branding attribution.

---

## 1. Overview
The goal is to allow users to export their vinyl collections (fully or filtered) to a printable PDF catalog directly from the browser using CSS print layouts.

## 2. Requirements
* **Preserve Filters**: The printable catalog must accept query parameters (search, genre, style, country, sort, order) and load the matching subset of releases.
* **High Density**: The catalog layout must be clean and compact, fitting approximately 15-20 records per A4/Letter page.
* **Local Cover Proxy**: Cover images must load via the local server proxy endpoint (`/api/media/cover/:id?variant=wall`) to ensure offline availability and user privacy.
* **Branding Footer / Mention**:
  * A small, discrete text at the bottom of the printed pages: *"Generado con Discographic (github.com/SimonBlancoE/discographic)"*.
  * A checkbox in the screen-only control panel: **"Ocultar mención al repositorio" (Hide repository mention)**.
  * The checkbox is **unchecked by default** (meaning the mention is visible by default).
  * If checked, the footer/mention is hidden from the print layout.
* **Print Trigger**:
  * Include a floating utility bar at the top (visible on screen, hidden in print with `print:hidden`).
  * Include an "Imprimir" (Print) button and a "Volver" (Back) button.
  * Auto-trigger the `window.print()` dialog once the collection data is loaded and rendered.

---

## 3. Architecture & Data Flow

### Route Definition
* Frontend Router (`src/App.tsx`):
  * Path: `/collection/print`
  * Component: `PrintCatalog` (defined under `src/pages/PrintCatalog.tsx`).

### Fetching Logic
* `PrintCatalog` reads search parameters using `useSearchParams()` from `react-router-dom`.
* Calls the existing `/api/collection` API with those search parameters to get the current list of releases.
* Shows a loading skeleton or spinner while loading.

### Styling & CSS (`@media print`)
* A screen-only utility bar styled with `print:hidden` fixed at the top of the viewport.
* Printable body:
  * Pure white background (`bg-white`), dark slate or black text (`text-slate-900`).
  * Table or list where each row has `break-inside: avoid` (or `page-break-inside: avoid`) to prevent records from splitting across paper sheets.
  * Disables hover animations and transitions.
  * Tiny cover thumbnail (50x50px) using object-cover and rounded corners.

---

## 4. UI Elements

### Floating Control Bar (Screen Only)
* **Checkbox**: "Ocultar mención al repositorio de GitHub" (binds to state `hideAttribution`, default `false`).
* **Button**: "Imprimir" (calls `window.print()`).
* **Button**: "Volver" (navigates back to `/collection` using React Router `useNavigate`).

### Attribution Footer (Print Layout)
* Rendered at the bottom of the catalog or as a footer of the print layout.
* CSS rules ensure it appears neatly at the bottom or end of the document.
* Conditionally rendered: `{!hideAttribution && <Footer />}`.
