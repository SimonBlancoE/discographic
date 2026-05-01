import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  homepage: string;
  repository: {
    url: string;
  };
  scripts: Record<string, string>;
};

type Tsconfig = {
  compilerOptions: Record<string, unknown>;
  extends?: string;
  include?: string[];
};

type PostcssConfig = {
  plugins: Record<string, unknown>;
};

const disallowedJavaScriptSourcePathspecs = ['*.js', '*.jsx', '*.mjs', '*.cjs'];
const projectRoot = new URL('../', import.meta.url);
const projectFile = (relativePath: string): URL => new URL(relativePath, projectRoot);
const fileExists = (relativePath: string): boolean => existsSync(projectFile(relativePath));
const readText = (relativePath: string): string => readFileSync(projectFile(relativePath), 'utf8');
const readJson = <JsonShape>(relativePath: string): JsonShape => JSON.parse(readText(relativePath));
const getTrackedJavaScriptSources = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--', ...disallowedJavaScriptSourcePathspecs], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => fileExists(filePath))
    .sort();
const packageJson = readJson<PackageJson>('package.json');

describe('TypeScript migration toolchain guardrails', () => {
  it('defines strict no-emit TypeScript defaults with a server build config', () => {
    expect(fileExists('tsconfig.json')).toBe(true);
    expect(fileExists('tsconfig.server.json')).toBe(true);

    const tsconfig = readJson<Tsconfig>('tsconfig.json');
    const serverTsconfig = readJson<Tsconfig>('tsconfig.server.json');

    expect(tsconfig.compilerOptions).toMatchObject({
      strict: true,
      allowJs: false,
      skipLibCheck: false,
      noEmit: true,
    });
    expect(tsconfig.include).toContain('tailwind.config.ts');
    expect(tsconfig.include).toContain('scripts/**/*.ts');
    expect(serverTsconfig.extends).toBe('./tsconfig.json');
    expect(serverTsconfig.compilerOptions).toMatchObject({
      noEmit: false,
      outDir: 'dist',
    });
    expect(serverTsconfig.include).toContain('server/**/*.ts');
    expect(serverTsconfig.include).toContain('shared/**/*.ts');
  });

  it('wires scripts for direct TypeScript execution, compiled production starts, and migration verification', () => {
    expect(packageJson.scripts.typecheck).toBe('tsc -p tsconfig.json');
    expect(packageJson.scripts.dev).toBe('vite');
    expect(packageJson.scripts['dev:server']).toBe('tsx watch server/index.ts');
    expect(packageJson.scripts.server).toBe('tsx server/index.ts');
    expect(packageJson.scripts['build:app']).toBe('vite build');
    expect(packageJson.scripts['build:server']).toBe('tsc -p tsconfig.server.json');
    expect(packageJson.scripts.build).toBe('npm run build:app && npm run build:server');
    expect(packageJson.scripts.start).toBe('node dist/server/start.js');
    expect(packageJson.scripts['scan:js-sources']).toBe('tsx scripts/scan-javascript-sources.ts');
    expect(packageJson.scripts['test:upgrade-smoke']).toBe('tsx scripts/upgrade-smoke.ts');
    expect(packageJson.scripts['test:upgrade-smoke:docker']).toBe(
      'DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=false DISCOGRAPHIC_UPGRADE_SMOKE_REQUIRE_DOCKER=true tsx scripts/upgrade-smoke.ts'
    );
    expect(packageJson.scripts['verify:upgrade-path']).toBe(
      'npm run scan:js-sources && npm run typecheck && npm run test && npm run build && npm run test:upgrade-smoke:docker'
    );
    expect(packageJson.scripts.verify).toBe('npm run scan:js-sources && npm run typecheck && npm run test && npm run build && npm run test:upgrade-smoke');
  });

  it('enforces zero tracked JavaScript source files, including tool config', () => {
    expect(fileExists('.postcssrc.json')).toBe(true);
    expect(fileExists('tailwind.config.ts')).toBe(true);
    expect(fileExists('postcss.config.js')).toBe(false);
    expect(fileExists('tailwind.config.js')).toBe(false);

    const postcssConfig = readJson<PostcssConfig>('.postcssrc.json');
    expect(postcssConfig.plugins).toEqual({
      tailwindcss: {},
      autoprefixer: {},
    });

    const tailwindConfig = readText('tailwind.config.ts');
    expect(tailwindConfig).toContain('./src/**/*.{ts,tsx}');
    expect(tailwindConfig).not.toContain('{js,ts,jsx,tsx}');

    expect(getTrackedJavaScriptSources()).toEqual([]);
  });

  it('marks Forgejo as the canonical upstream in package metadata', () => {
    expect(packageJson.repository.url).toBe('git+https://git.simonblanco.xyz/octo/discographic.git');
    expect(packageJson.homepage).toBe('https://git.simonblanco.xyz/octo/discographic');
  });

  it('documents TypeScript-only contribution guardrails and required verification', () => {
    expect(fileExists('CONTRIBUTING.md')).toBe(true);
    expect(fileExists('scripts/scan-javascript-sources.ts')).toBe(true);

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
    expect(contributing).toContain('npm run test:upgrade-smoke');
    expect(contributing).toContain('npm run test:upgrade-smoke:docker');
    expect(contributing).toContain('npm run verify:upgrade-path');
    expect(contributing).toContain('npm run verify');
  });
});
