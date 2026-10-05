// `pnpm try`: builds the server for both runtimes, starts them with throwaway
// local credentials, and serves the slice try pages (try/*.html) on one origin.
// Ctrl-C stops everything. State lives in .try/ and is wiped on every start.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SERVER = join(ROOT, 'packages/server');
const STATE = join(ROOT, '.try');
const PORTS = { page: 8794, workers: 8805, node: 8807 };
const CREDENTIALS = { email: 'owner@venda.local', password: 'try-venda' };
const SECRETS = { SESSION_SECRET: 'try-session-secret', ADMIN_EMAIL: CREDENTIALS.email, ADMIN_PASSWORD: CREDENTIALS.password };
const children = [];

function spawnLogged(name, command, args, options = {}) {
  const log = createWriteStream(join(STATE, `${name}.log`));
  const child = spawn(command, args, { cwd: SERVER, detached: true, ...options, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.pipe(log);
  child.stderr.pipe(log);

  return child;
}

function step(label, command, args, env) {
  process.stdout.write(`  ${label}… `);

  return new Promise((done, fail) => {
    spawnLogged(label.replaceAll(' ', '-'), command, args, { env }).once('exit', code => {
      if (code === 0) {
        console.log('done');
        done();
        return;
      }

      console.log(`failed (see .try/${label.replaceAll(' ', '-')}.log)`);
      fail(new Error(`${label} failed`));
    });
  });
}

function serve(name, command, args, env) {
  children.push(spawnLogged(name, command, args, { env }));
}

async function healthy(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await fetch(`http://localhost:${port}/api/health`).then(r => r.ok, () => false)) return;

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Nothing answered on port ${port}; see .try/*.log`);
}

// Each runtime's session cookie is scoped to its own prefix, and `Secure` is
// dropped because Safari refuses Secure cookies on http://localhost.
function scopeCookie(cookie, prefix) {
  return cookie.replace(/;\s*Secure/i, '').replace(/Path=\/(;|$)/i, `Path=${prefix}/$1`);
}

async function proxy(request, response, prefix, port) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => key !== 'host' && key !== 'origin'));
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks);
  const upstream = await fetch(`http://localhost:${port}${request.url.slice(prefix.length)}`, { method: request.method, headers, body, redirect: 'manual' });
  const out = {};

  upstream.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && key !== 'content-encoding' && key !== 'content-length') out[key] = value;
  });

  out['set-cookie'] = upstream.headers.getSetCookie().map(cookie => scopeCookie(cookie, prefix));
  response.writeHead(upstream.status, out);
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function page(name, response) {
  const file = name === '/' ? 'index.html' : `${name.slice(1)}.html`;

  if (!/^[a-z0-9-]+\.html$/.test(file)) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(await readFile(join(ROOT, 'try', file)));
  } catch {
    response.writeHead(404).end('Not found');
  }
}

function startPageServer() {
  createServer((request, response) => {
    const url = request.url ?? '/';
    const route = url.startsWith('/workers') ? ['/workers', PORTS.workers] : url.startsWith('/node') ? ['/node', PORTS.node] : null;
    const handled = route ? proxy(request, response, route[0], route[1]) : page(url.split('?')[0], response);

    handled.catch(error => response.writeHead(502).end(String(error)));
  }).listen(PORTS.page);
}

function stopAll() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  process.exit(0);
}

await rm(STATE, { recursive: true, force: true });
await mkdir(join(STATE, 'workers'), { recursive: true });
console.log('Venda try: building and starting both runtimes');

await step('build for Workers', 'pnpm', ['exec', 'nitro', 'build']);
await step('migrate local D1', 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'VENDA_DB', '--local', '--persist-to', join(STATE, 'workers'), '--config', '.output/server/wrangler.json']);
await step('build for Node', 'pnpm', ['exec', 'nitro', 'build'], { NITRO_PRESET: 'node' });

const vars = Object.entries(SECRETS).flatMap(([key, value]) => ['--var', `${key}:${value}`]);

serve('workers', 'npx', ['wrangler', 'dev', '--local', '--persist-to', join(STATE, 'workers'), '--config', '.output/server/wrangler.json', '--port', String(PORTS.workers), ...vars]);
serve('node', 'node', ['.output-node/server/index.mjs'], { ...SECRETS, PORT: String(PORTS.node), VENDA_DATA_DIR: join(STATE, 'node') });
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

await Promise.all([healthy(PORTS.workers), healthy(PORTS.node)]);
startPageServer();

console.log(`
  Open http://localhost:${PORTS.page}

  Sign in as ${CREDENTIALS.email} / ${CREDENTIALS.password} (local only; wiped on every start)
  Workers (workerd + local D1/R2/KV): http://localhost:${PORTS.workers}
  Node (SQLite + files):              http://localhost:${PORTS.node}
  Logs: .try/*.log · Ctrl-C to stop
`);
