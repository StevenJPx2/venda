import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(packageDir, '../..');
const serverDir = join(packageDir, 'server');
const adminDir = join(rootDir, 'apps/admin/.output/public');
const apiConfig = join(rootDir, 'apps/api/wrangler.jsonc');
const apiMigrations = join(rootDir, 'apps/api/migrations');

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`)));
  });
}

await rm(serverDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });

console.log('Building client-only admin assets…');
await run('pnpm', ['--filter', '@venda/admin', 'exec', 'nuxt', 'generate'], {
  env: { ...process.env, VENDA_ADMIN_TARGET: 'static', NUXT_PUBLIC_API_BASE: '/api' }
});

console.log('Bundling the API Worker with Wrangler…');
const workerOut = join(serverDir, 'worker');
await mkdir(workerOut, { recursive: true });
await run('pnpm', ['--filter', 'venda', 'exec', 'wrangler', 'deploy', '--dry-run', '--outdir', workerOut, '--config', apiConfig]);

const outputFiles = await readdir(workerOut);
const workerBundle = outputFiles.find(file => file.endsWith('.js') && !file.endsWith('.map'));
if (!workerBundle) throw new Error(`Wrangler did not emit a Worker bundle in ${workerOut}.`);
if (workerBundle !== 'index.js') await cp(join(workerOut, workerBundle), join(workerOut, 'index.js'));

await cp(adminDir, join(serverDir, 'admin'), { recursive: true });
await cp(apiMigrations, join(serverDir, 'migrations'), { recursive: true });

console.log(`Packaged Worker, admin SPA and ${ (await readdir(join(serverDir, 'migrations'))).length } migration file(s) in ${serverDir}`);
