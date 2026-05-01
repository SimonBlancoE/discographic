import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRuntimePaths } from '../server/runtimePaths.js';

const tempRoots: string[] = [];

function createTempAppRoot(): string {
  const appRoot = mkdtempSync(join(tmpdir(), 'discographic-runtime-paths-'));
  tempRoots.push(appRoot);

  writeFileSync(join(appRoot, 'package.json'), '{}');
  mkdirSync(join(appRoot, 'server', 'services'), { recursive: true });
  mkdirSync(join(appRoot, 'dist', 'server', 'services'), { recursive: true });

  return appRoot;
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('runtime path resolution', () => {
  it('maps source and compiled server modules to the same app directories', () => {
    const appRoot = createTempAppRoot();
    const expectedPaths = {
      appRoot,
      dataDir: join(appRoot, 'data'),
      distDir: join(appRoot, 'dist'),
    };

    expect(resolveRuntimePaths(pathToFileURL(join(appRoot, 'server', 'index.ts')))).toEqual(expectedPaths);
    expect(resolveRuntimePaths(pathToFileURL(join(appRoot, 'server', 'services', 'coverMedia.ts')))).toEqual(expectedPaths);
    expect(resolveRuntimePaths(pathToFileURL(join(appRoot, 'dist', 'server', 'index.js')))).toEqual(expectedPaths);
    expect(resolveRuntimePaths(pathToFileURL(join(appRoot, 'dist', 'server', 'services', 'coverMedia.js')))).toEqual(expectedPaths);
  });

  it('supports explicit smoke-test overrides for data and built assets', () => {
    const appRoot = createTempAppRoot();
    const sourceUrl = pathToFileURL(join(appRoot, 'dist', 'server', 'index.js'));
    const originalDataDir = process.env.DISCOGRAPHIC_DATA_DIR;
    const originalDistDir = process.env.DISCOGRAPHIC_DIST_DIR;

    process.env.DISCOGRAPHIC_DATA_DIR = join(appRoot, 'fixtures', 'data');
    process.env.DISCOGRAPHIC_DIST_DIR = join(appRoot, 'fixtures', 'dist');

    try {
      expect(resolveRuntimePaths(sourceUrl)).toEqual({
        appRoot,
        dataDir: join(appRoot, 'fixtures', 'data'),
        distDir: join(appRoot, 'fixtures', 'dist'),
      });
    } finally {
      if (originalDataDir === undefined) {
        delete process.env.DISCOGRAPHIC_DATA_DIR;
      } else {
        process.env.DISCOGRAPHIC_DATA_DIR = originalDataDir;
      }

      if (originalDistDir === undefined) {
        delete process.env.DISCOGRAPHIC_DIST_DIR;
      } else {
        process.env.DISCOGRAPHIC_DIST_DIR = originalDistDir;
      }
    }
  });
});
