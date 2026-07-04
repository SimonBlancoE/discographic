# Printable Catalog Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dedicated printable catalog route (`/collection/print`) that loads the currently filtered vinyl collection, formats it with a clean, high-density print layout, and includes an optional toggle to hide the GitHub repository attribution.

**Architecture:** A new React route page (`PrintCatalog.tsx`) that reads URL search parameters to query the API (`api.getCollection`), applies monochrome grid styles using `@media print` rules, and handles the `window.print()` cycle.

**Tech Stack:** React, Tailwind CSS, React Router, custom Print CSS.

---

### Task 1: Route Setup & Translation Keys

**Files:**
- Modify: `src/App.tsx`
- Modify: `shared/i18n.ts`

- [ ] **Step 1: Add new route `/collection/print` in router configuration**

Modify `src/App.tsx` to register `/collection/print` pointing to a new lazy-loaded `PrintCatalog` page.

```typescript
// src/App.tsx
const PrintCatalog = lazy(() => import('./pages/PrintCatalog'));
// inside the router definition:
{
  path: '/collection/print',
  element: <PrintCatalog />,
}
```

- [ ] **Step 2: Add translation keys for Print features**

Ensure Spanish and English catalogs have translation terms.
Add the following keys under `collection` in `shared/i18n.ts` (both `es` and `en` blocks):

* Spanish:
  * `collection.printCatalog`: "Imprimir catálogo"
  * `collection.hideAttribution`: "Ocultar mención al repositorio de GitHub"
  * `collection.catalogTitle`: "Catálogo de Colección"
  * `collection.backToCollection`: "Volver a la colección"
* English:
  * `collection.printCatalog`: "Print Catalog"
  * `collection.hideAttribution`: "Hide GitHub repository mention"
  * `collection.catalogTitle`: "Collection Catalog"
  * `collection.backToCollection`: "Back to Collection"

- [ ] **Step 3: Run verify command to check TypeScript and build**

Run: `PATH="/home/octo/.local/share/pnpm/store/v11/links/@/node/22.23.1/a1a2a5b55266ee26c1630db004366a4d567289796d3e388f76c2be4eba4c5a5a/node_modules/node/bin:$PATH" pnpm run verify`
Expected: PASS with no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx shared/i18n.ts
git commit -m "feat: setup routing and translations for print catalog"
```

---

### Task 2: Create the PrintCatalog Page

**Files:**
- Create: `src/pages/PrintCatalog.tsx`

- [ ] **Step 1: Write initial implementation of PrintCatalog.tsx**

Create `src/pages/PrintCatalog.tsx` with full React logic, search param reading, fetching from `api.getCollection`, state toggles, and printing triggers.

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';
import { DEFAULT_CURRENCY } from '../../shared/currency';
import type { CollectionRelease } from '../../shared/contracts/release';

export default function PrintCatalog() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [releases, setReleases] = useState<CollectionRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideAttribution, setHideAttribution] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        // Load all items matching current filters (using high limit for catalog printing)
        const params: Record<string, any> = {};
        searchParams.forEach((value, key) => {
          params[key] = value;
        });
        const response = await api.getCollection({
          ...params,
          page: 1,
          limit: 1000, // Load a large batch for catalog printing
        });
        setReleases(response.releases);
      } catch (error) {
        console.error('Failed to load printable catalog:', error);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [searchParams]);

  // Auto print when loading completes and images are ready
  useEffect(() => {
    if (!loading && releases.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, releases]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-slate-800">
        <div className="text-lg font-medium">Cargando catálogo para impresión...</div>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString();

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 font-sans print:p-0">
      {/* Floating Control Panel - Hidden in Print */}
      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-slate-200 bg-white/95 px-6 py-3 shadow-xl backdrop-blur-md print:hidden">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 select-none">
          <input
            type="checkbox"
            checked={hideAttribution}
            onChange={(e) => setHideAttribution(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {t('collection.hideAttribution') || 'Ocultar mención al repositorio'}
        </label>
        <div className="h-4 w-px bg-slate-200" />
        <button
          onClick={() => window.print()}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          {t('collection.print') || 'Imprimir'}
        </button>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          {t('collection.backToCollection') || 'Volver'}
        </button>
      </div>

      {/* Printable Catalog Page Header */}
      <header className="mb-6 flex items-baseline justify-between border-b border-slate-300 pb-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">
            {t('collection.catalogTitle') || 'Catálogo de Colección'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Total: {releases.length} vinilos | {currentDate}
          </p>
        </div>
      </header>

      {/* Catalog Items - Printable Grid/Table */}
      <div className="divide-y divide-slate-200">
        {releases.map((release) => {
          const coverUrl = release.id ? `/api/media/cover/${release.id}?variant=wall` : release.cover_url;
          return (
            <div
              key={release.id}
              className="flex items-center py-2 gap-4 break-inside-avoid print:break-inside-avoid"
            >
              <div className="h-12 w-12 flex-shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg">💿</div>
                )}
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold text-sm text-slate-900 truncate">
                    {release.artist} - {release.title}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono whitespace-nowrap ml-2">
                    {release.year || '-'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
                  <span className="truncate max-w-xs">
                    {release.labels.map((l: any) => l.name || l).join(', ') || '-'}
                  </span>
                  {release.formats.length > 0 && (
                    <span className="text-slate-500">
                      • {release.formats.map((f: any) => f.name || f).join(', ')}
                    </span>
                  )}
                  {release.country && (
                    <span className="text-slate-500">• {release.country}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* GitHub Repository Attribution Footer */}
      {!hideAttribution && (
        <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400 font-mono">
          Generado con Discographic (github.com/SimonBlancoE/discographic)
        </footer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run verify command to verify TypeScript compilation passes**

Run: `PATH="/home/octo/.local/share/pnpm/store/v11/links/@/node/22.23.1/a1a2a5b55266ee26c1630db004366a4d567289796d3e388f76c2be4eba4c5a5a/node_modules/node/bin:$PATH" pnpm run verify`
Expected: PASS with zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PrintCatalog.tsx
git commit -m "feat: implement PrintCatalog page with high-density print layout"
```

---

### Task 3: Add the "Print Catalog" Button to the Collection Page

**Files:**
- Modify: `src/pages/Collection.tsx`

- [ ] **Step 1: Import Link and render the Print button**

Modify `src/pages/Collection.tsx` to:
1. Import `Link` from `react-router-dom` on line 2.
2. Render a "Print Catalog" link button next to `ExportButton` on line 354-355.

```tsx
// Imports (around line 2)
import { useSearchParams, Link } from 'react-router-dom';

// Rendering (around line 354)
<ExportButton filters={{ ...filters, currency: displayCurrency }} disabled={!discogsConfigured} />
<Link
  to={`/collection/print?${searchParams.toString()}`}
  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 transition"
>
  {t('collection.printCatalog') || 'Imprimir catálogo'}
</Link>
```

- [ ] **Step 2: Run verification and tests**

Run: `PATH="/home/octo/.local/share/pnpm/store/v11/links/@/node/22.23.1/a1a2a5b55266ee26c1630db004366a4d567289796d3e388f76c2be4eba4c5a5a/node_modules/node/bin:$PATH" pnpm run verify`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/Collection.tsx
git commit -m "feat: add Print Catalog button to Collection header"
```
