import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

describe('frontend TypeScript migration', () => {
  it('keeps the frontend source tree free of project-owned js and jsx files', () => {
    const frontendFiles = listFiles(new URL('../src', import.meta.url).pathname);
    const javascriptFiles = frontendFiles.filter((file) => /\.(jsx?|mjs|cjs)$/.test(file));

    expect(javascriptFiles).toEqual([]);
  });

  it('keeps frontend contract tests on TypeScript', () => {
    const expectedTsTests = [
      'app-code-splitting.test.ts',
      'columns.test.ts',
      'wall-grid.test.ts',
      'import-sync-state.test.ts',
      'vinyl-badge.test.ts'
    ];
    const testsRoot = new URL('../tests', import.meta.url).pathname;

    for (const filename of expectedTsTests) {
      expect(readdirSync(testsRoot)).toContain(filename);
    }
  });

  it('points the Vite HTML entrypoint at the TypeScript React entry module', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    expect(html).toContain('/src/main.tsx');
    expect(html).not.toContain('/src/main.jsx');
  });
});
