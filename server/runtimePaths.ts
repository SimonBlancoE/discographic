import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RuntimePaths = {
  appRoot: string;
  dataDir: string;
  distDir: string;
};

function getModuleDir(moduleUrl: string | URL): string {
  const modulePath = typeof moduleUrl === 'string' ? fileURLToPath(moduleUrl) : fileURLToPath(moduleUrl);
  return dirname(modulePath);
}

function findAppRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not find project root for runtime path resolution from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

function getOverridePath(envKey: 'DISCOGRAPHIC_APP_ROOT' | 'DISCOGRAPHIC_DATA_DIR' | 'DISCOGRAPHIC_DIST_DIR'): string | null {
  const value = process.env[envKey]?.trim();
  return value ? resolve(value) : null;
}

export function resolveRuntimePaths(moduleUrl: string | URL): RuntimePaths {
  const discoveredAppRoot = findAppRoot(getModuleDir(moduleUrl));
  const appRoot = getOverridePath('DISCOGRAPHIC_APP_ROOT') ?? discoveredAppRoot;

  return {
    appRoot,
    dataDir: getOverridePath('DISCOGRAPHIC_DATA_DIR') ?? join(appRoot, 'data'),
    distDir: getOverridePath('DISCOGRAPHIC_DIST_DIR') ?? join(appRoot, 'dist'),
  };
}
