import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const lazyPages = [
  'Dashboard',
  'Collection',
  'CollectionWall',
  'ReleaseDetail',
  'Settings',
  'Login',
  'Setup'
];

describe('App route code splitting', () => {
  it('lazy loads page modules instead of statically importing them', () => {
    for (const page of lazyPages) {
      expect(appSource).not.toContain(`import ${page} from './pages/${page}'`);
      expect(appSource).toContain(`const ${page} = lazy(() => import('./pages/${page}'))`);
    }
  });

  it('wraps lazy routes with Suspense using the existing app loading copy', () => {
    expect(appSource).toContain("import { lazy, Suspense } from 'react'");
    expect(appSource).toContain('<Suspense fallback={<AppLoading />}>');
    expect(appSource).toContain("t('app.loading')");
  });
});
