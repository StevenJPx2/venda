// Runs every live suite in sequence (they share ports); exits non-zero if any fails.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const only = process.argv[2];
// Every preset hosts the built admin from this same origin.
const built = spawnSync('pnpm', ['--filter', '@venda/admin-app', 'build'], { cwd: dir, stdio: 'inherit' });

if (built.status !== 0) process.exit(built.status ?? 1);

const suites = readdirSync(dir).filter(file => file.endsWith('.e2e.mjs') && (!only || file.startsWith(only))).sort();
let failed = 0;

for (const file of suites) {
  const { status } = spawnSync(process.execPath, [file], { cwd: dir, stdio: 'inherit' });

  if (status !== 0) failed++;
}

console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
