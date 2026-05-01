import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

const disallowedExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
});

const disallowedFiles = trackedFiles
  .split('\0')
  .filter(Boolean)
  .filter((filePath) => existsSync(filePath))
  .filter((filePath) => disallowedExtensions.has(extname(filePath)))
  .sort();

if (disallowedFiles.length === 0) {
  console.log('No tracked JavaScript source files found.');
  process.exit(0);
}

console.error('Tracked JavaScript source files must be migrated to TypeScript:');
for (const filePath of disallowedFiles) {
  console.error(`- ${filePath}`);
}
console.error('');
console.error('Migration guardrail: remove or convert the files above before the final TypeScript-only verification gate passes.');
process.exit(1);
