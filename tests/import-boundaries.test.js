import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

function walkJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkJsFiles(full));
    } else if (/\.(js|jsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// shared/ is consumed by both Vite (src/) and Node (server/). Anything in
// shared/ that reaches up into src/ or server/ creates a cross-tier cycle
// that one of the bundlers will silently mis-handle. Catch it here.

describe('shared/ module boundary', () => {
  const sharedFiles = walkJsFiles(join(repoRoot, 'shared'));

  it('contains at least one source file', () => {
    expect(sharedFiles.length).toBeGreaterThan(0);
  });

  for (const file of sharedFiles) {
    const rel = file.slice(repoRoot.length + 1);
    it(`${rel} does not import from src/ or server/`, () => {
      const source = readFileSync(file, 'utf8');
      const importLines = source.match(/^\s*(?:import|export)\s.+from\s+['"][^'"]+['"]/gm) || [];
      const offenders = importLines.filter((line) =>
        /['"](\.\.\/)+(src|server)\//.test(line)
        || /['"](src|server)\//.test(line)
      );
      expect(offenders, `unexpected upward import in ${rel}`).toEqual([]);
    });
  }
});
