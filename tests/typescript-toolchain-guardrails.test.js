import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const readText = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

describe('TypeScript migration toolchain guardrails', () => {
  it('defines strict no-emit TypeScript defaults with a server build config', () => {
    expect(existsSync(new URL('../tsconfig.json', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../tsconfig.server.json', import.meta.url))).toBe(true);

    const tsconfig = readJson('tsconfig.json');
    const serverTsconfig = readJson('tsconfig.server.json');

    expect(tsconfig.compilerOptions).toMatchObject({
      strict: true,
      allowJs: false,
      skipLibCheck: false,
      noEmit: true,
    });
    expect(serverTsconfig.extends).toBe('./tsconfig.json');
    expect(serverTsconfig.compilerOptions).toMatchObject({
      noEmit: false,
      outDir: 'dist/server',
    });
    expect(serverTsconfig.include).toContain('server/start.ts');
  });

  it('wires scripts for direct TypeScript execution, compiled production starts, and migration verification', () => {
    expect(packageJson.scripts.typecheck).toBe('tsc -p tsconfig.json');
    expect(packageJson.scripts.dev).toBe('vite');
    expect(packageJson.scripts['dev:server']).toBe('tsx watch server/index.js');
    expect(packageJson.scripts.server).toBe('tsx server/index.js');
    expect(packageJson.scripts['build:app']).toBe('vite build');
    expect(packageJson.scripts['build:server']).toBe('tsc -p tsconfig.server.json');
    expect(packageJson.scripts.build).toBe('npm run build:app && npm run build:server');
    expect(packageJson.scripts.start).toBe('node dist/server/start.js');
    expect(packageJson.scripts['scan:js-sources']).toBe('node scripts/scan-javascript-sources.mjs');
    expect(packageJson.scripts.verify).toBe('npm run scan:js-sources && npm run typecheck && npm run test && npm run build');
  });

  it('marks Forgejo as the canonical upstream in package metadata', () => {
    expect(packageJson.repository.url).toBe('git+https://git.simonblanco.xyz/octo/discographic.git');
    expect(packageJson.homepage).toBe('https://git.simonblanco.xyz/octo/discographic');
  });

  it('documents TypeScript-only contribution guardrails and required verification', () => {
    expect(existsSync(new URL('../CONTRIBUTING.md', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../scripts/scan-javascript-sources.mjs', import.meta.url))).toBe(true);

    const readme = readText('README.md');
    const contributing = readText('CONTRIBUTING.md');

    expect(readme).toContain('https://git.simonblanco.xyz/octo/discographic.git');
    expect(readme).toContain('CONTRIBUTING.md');

    expect(contributing).toContain('Forgejo');
    expect(contributing).toContain('GitHub publication');
    expect(contributing).toContain('TypeScript-only');
    expect(contributing).toContain('untrusted boundary');
    expect(contributing).toContain('npm run typecheck');
    expect(contributing).toContain('npm run test');
    expect(contributing).toContain('npm run build');
    expect(contributing).toContain('npm run verify');
  });
});
