import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  engines: {
    node: string;
  };
  homepage: string;
  packageManager: string;
  repository: {
    url: string;
  };
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
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
  it('declares pnpm, Node 22, and runtime-matched type packages as the supported toolchain', () => {
    expect(packageJson.packageManager).toBe('pnpm@10.22.0');
    expect(fileExists('pnpm-lock.yaml')).toBe(true);
    expect(fileExists('package-lock.json')).toBe(false);
    expect(fileExists('.node-version')).toBe(true);
    expect(readText('.node-version').trim()).toMatch(/^22\./);
    expect(packageJson.engines.node).toBe('>=22 <23');

    const pnpmWorkspace = readText('pnpm-workspace.yaml');
    expect(pnpmWorkspace).toContain('onlyBuiltDependencies:');
    expect(pnpmWorkspace).toContain('better-sqlite3');
    expect(pnpmWorkspace).toContain('esbuild');
    expect(pnpmWorkspace).toContain('sharp');
    expect(pnpmWorkspace).toContain('ignoredBuiltDependencies:');
    expect(pnpmWorkspace).toContain('@parcel/watcher');
    expect(pnpmWorkspace).toContain('msgpackr-extract');
    expect(pnpmWorkspace).toContain('trustPolicy: no-downgrade');
    expect(pnpmWorkspace).toContain('trustPolicyExclude:');
    expect(pnpmWorkspace).toContain('undici-types');
    expect(pnpmWorkspace).toContain('semver');
    expect(pnpmWorkspace).not.toContain('trustPolicy: off');

    expect(packageJson.dependencies.express).toMatch(/^\^4\./);
    expect(packageJson.devDependencies['@types/express']).toMatch(/^\^4\./);
    expect(packageJson.devDependencies['@types/node']).toMatch(/^\^22\./);
    expect(packageJson.devDependencies.vite).toMatch(/^\^6\./);
    expect(packageJson.devDependencies.vitest).toMatch(/^\^4\./);
  });

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
    expect(tsconfig.include).toContain('tests/**/*.tsx');
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
    expect(packageJson.scripts.build).toBe('pnpm run build:app && pnpm run build:server');
    expect(packageJson.scripts.start).toBe('node dist/server/start.js');
    expect(packageJson.scripts['scan:js-sources']).toBe('tsx scripts/scan-javascript-sources.ts');
    expect(packageJson.scripts['test:upgrade-smoke']).toBe('tsx scripts/upgrade-smoke.ts');
    expect(packageJson.scripts['test:upgrade-smoke:docker']).toBe(
      'DISCOGRAPHIC_UPGRADE_SMOKE_SKIP_DOCKER=false DISCOGRAPHIC_UPGRADE_SMOKE_REQUIRE_DOCKER=true tsx scripts/upgrade-smoke.ts'
    );
    expect(packageJson.scripts['verify:upgrade-path']).toBe(
      'pnpm run scan:js-sources && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:upgrade-smoke:docker'
    );
    expect(packageJson.scripts.verify).toBe('pnpm run scan:js-sources && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:upgrade-smoke');
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

  it('marks GitHub as the public repository in package metadata', () => {
    expect(packageJson.repository.url).toBe('git+https://github.com/SimonBlancoE/discographic.git');
    expect(packageJson.homepage).toBe('https://github.com/SimonBlancoE/discographic');
  });

  it('documents TypeScript-only contribution guardrails and required verification', () => {
    expect(fileExists('CONTRIBUTING.md')).toBe(true);
    expect(fileExists('scripts/scan-javascript-sources.ts')).toBe(true);

    const readme = readText('README.md');
    const contributing = readText('CONTRIBUTING.md');

    expect(readme).toContain('https://github.com/SimonBlancoE/discographic.git');
    expect(readme).toContain('CONTRIBUTING.md');

    expect(contributing).toContain('GitHub');
    expect(contributing).toContain('Direct contributions are not accepted');
    expect(contributing).toContain('TypeScript-only');
    expect(contributing).toContain('untrusted boundary');
    expect(contributing).toContain('pnpm run typecheck');
    expect(contributing).toContain('pnpm run test');
    expect(contributing).toContain('pnpm run build');
    expect(contributing).toContain('pnpm run test:upgrade-smoke');
    expect(contributing).toContain('pnpm run test:upgrade-smoke:docker');
    expect(contributing).toContain('pnpm run verify:upgrade-path');
    expect(contributing).toContain('pnpm run verify');
    expect(contributing).toContain('Docker daemon is unreachable');
    expect(contributing).toContain('reachable Docker daemon');
    expect(contributing).toContain('The JavaScript scan is expected to pass once the tracked source tree is TypeScript-only');
    expect(contributing).not.toContain('The JavaScript scan is expected to fail until parent issue `#9` removes the remaining versioned JavaScript and JSX files.');
  });

  it('keeps mutable runtime data out of Docker build artifacts', () => {
    expect(fileExists('Dockerfile')).toBe(true);
    expect(fileExists('.dockerignore')).toBe(true);

    const dockerfile = readText('Dockerfile');
    const dockerignore = readText('.dockerignore');

    expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./');
    expect(dockerfile).toContain('RUN pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('RUN pnpm install --prod --frozen-lockfile');
    expect(dockerfile).toContain('RUN pnpm run build');
    expect(dockerfile).toContain('COPY --from=build /app/dist ./dist');
    expect(dockerfile).toContain('CMD ["pnpm", "run", "start"]');
    expect(dockerfile).not.toMatch(/^RUN npm\b/m);
    expect(dockerfile).not.toContain('CMD ["npm"');
    expect(dockerfile).not.toContain('COPY --from=build /app/data ./data');
    expect(dockerignore).toContain('data');
  });
});
