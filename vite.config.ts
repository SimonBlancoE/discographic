import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const apiPort = process.env.VITE_API_PORT || 3800;

function resolveJsSpecifiersToTsSource(): Plugin {
  return {
    name: 'resolve-js-specifiers-to-ts-source',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) {
        return null;
      }

      const importerPath = importer.split('?')[0];
      const jsPath = resolve(dirname(importerPath), source);
      const tsPath = jsPath.replace(/\.js$/, '.ts');

      if (!existsSync(tsPath)) {
        return null;
      }

      return this.resolve(tsPath, importer, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [resolveJsSpecifiersToTsSource(), react()],
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
