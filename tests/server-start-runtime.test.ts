import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('server start runtime', () => {
  it('boots the compiled backend entrypoint instead of the source runtime', () => {
    const source = readFileSync(new URL('../server/start.ts', import.meta.url), 'utf8');

    expect(source).toContain("await import('./index.js');");
    expect(source).not.toContain('../../server/index.js');
  });
});
