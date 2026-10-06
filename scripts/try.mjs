// `pnpm try`: builds the server for two Nitro presets, starts them, and serves
// the slice try pages (try/*.html) on one origin. Ctrl-C stops everything.
// State lives in .try/ and is wiped on every start.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SERVER = join(ROOT, 'packages/server');
const STATE = join(ROOT, '.try');
// Bundled into the Workers build; Node runs in .try/node and serves (and
// watches) an editable copy in its working directory, with its data beside it.
const CONTENT = join(ROOT, 'try/content');
const NODE_DIR = join(STATE, 'node');
const LIVE_CONTENT = join(NODE_DIR, 'content');
const CONTENT_FILE = /^\/files\/([a-z0-9-]+\/[a-z0-9-]+\.mdx?)$/;
const PORTS = { page: 8794, workers: 8805, node: 8807 };
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

function serve(name, command, args, options = {}) {
  children.push(spawnLogged(name, command, args, options));
}

async function healthy(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await fetch(`http://localhost:${port}/api/health`).then(r => r.ok, () => false)) return;

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Nothing answered on port ${port}; see .try/*.log`);
}

async function proxy(request, response, prefix, port) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => key !== 'host' && key !== 'origin'));
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks);
  const upstream = await fetch(`http://localhost:${port}${request.url.slice(prefix.length)}`, { method: request.method, headers, body, redirect: 'manual' });
  const out = {};

  upstream.headers.forEach((value, key) => {
    if (key !== 'content-encoding' && key !== 'content-length') out[key] = value;
  });

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

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf8');
}

// Local-only helpers for the slice 1 page: read and write Node's content
// files, and list the problems its sync recorded (straight from its SQLite).
async function files(request, response, path) {
  if (path === '/files/problems') {
    const db = new DatabaseSync(join(NODE_DIR, '.data/venda.sqlite'), { readOnly: true });
    const problems = db.prepare('SELECT path, message, line FROM content_problems ORDER BY path').all();

    db.close();
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(problems));
    return;
  }

  const file = CONTENT_FILE.exec(path)?.[1];

  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }

  if (request.method === 'PUT') {
    await writeFile(join(LIVE_CONTENT, file), await readBody(request));
    response.writeHead(204).end();
    return;
  }

  const text = await readFile(join(LIVE_CONTENT, file), 'utf8').catch(() => null);

  response.writeHead(text === null ? 404 : 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }).end(text ?? 'Not found');
}

function startPageServer() {
  createServer((request, response) => {
    const url = request.url ?? '/';
    const path = url.split('?')[0];
    const route = url.startsWith('/workers') ? ['/workers', PORTS.workers] : url.startsWith('/node') ? ['/node', PORTS.node] : null;
    const handled = route ? proxy(request, response, route[0], route[1]) : path.startsWith('/files/') ? files(request, response, path) : page(path, response);

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
await cp(CONTENT, LIVE_CONTENT, { recursive: true });
console.log('Venda try: building and starting both runtimes');

await step('build for Workers', 'pnpm', ['exec', 'nitro', 'build'], { VENDA_CONTENT_DIR: CONTENT });
await step('build for Node', 'pnpm', ['exec', 'nitro', 'build'], { NITRO_PRESET: 'node' });

serve('workers', 'npx', ['wrangler', 'dev', '--local', '--persist-to', join(STATE, 'workers'), '--config', '.output/server/wrangler.json', '--port', String(PORTS.workers)]);
serve('node', 'node', [join(SERVER, '.output-node/server/index.mjs')], { cwd: NODE_DIR, env: { PORT: String(PORTS.node) } });
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

await Promise.all([healthy(PORTS.workers), healthy(PORTS.node)]);
startPageServer();

console.log(`
  Open http://localhost:${PORTS.page}

  Workers (workerd + local D1): http://localhost:${PORTS.workers}, content from try/content, bundled
  Node (node:sqlite + files):   http://localhost:${PORTS.node}, content from .try/node/content (edit freely)
  Logs: .try/*.log · Ctrl-C to stop
`);
