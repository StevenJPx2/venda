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
// Throwaway local credentials for the recovery owner; wiped with .try/ on every start.
const OWNER_ENV = { VENDA_OWNER_EMAIL: 'owner@venda.local', VENDA_OWNER_PASSWORD: 'try-venda-owner' };
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

// One cookie jar per runtime and person, kept here rather than in the browser,
// so a single page can act as several people (`x-try-as: owner`). The browser
// cannot read HttpOnly cookies, so the Set-Cookie the server sent is echoed in
// `x-try-set-cookie` for the page to show.
const jars = new Map();

const TRY_HEADERS = new Set(['host', 'origin', 'cookie', 'x-try-as', 'x-try-origin']);

async function proxy(request, response, prefix, port) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  const jar = `${prefix}:${request.headers['x-try-as'] ?? 'anonymous'}`;
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !TRY_HEADERS.has(key)));

  if (jars.has(jar)) headers.cookie = jars.get(jar);

  // The page is same-origin in spirit; `x-try-origin` plays a request from another site.
  if (request.headers['x-try-origin']) headers.origin = request.headers['x-try-origin'];

  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks);
  const upstream = await fetch(`http://localhost:${port}${request.url.slice(prefix.length)}`, { method: request.method, headers, body, redirect: 'manual' });
  const out = {};
  const setCookie = upstream.headers.getSetCookie();

  for (const cookie of setCookie) jars.set(jar, cookie.split(';')[0]);

  upstream.headers.forEach((value, key) => {
    if (key !== 'content-encoding' && key !== 'content-length' && key !== 'set-cookie') out[key] = value;
  });

  if (setCookie.length) out['x-try-set-cookie'] = setCookie.join(', ');

  response.writeHead(upstream.status, out);
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

const MISTAKES = join(ROOT, 'packages/core/test/mistakes.ts');

// Not a dot-file: TypeScript's include globs skip those.
const UNCHECKED = join(ROOT, 'packages/core/test/mistakes-unchecked.ts');

/** Type-checks the core with the mistakes file's `@ts-expect-error` markers removed, and returns what the compiler says. */
async function compileMistakes(response) {
  await writeFile(UNCHECKED, (await readFile(MISTAKES, 'utf8')).replaceAll(/^\s*\/\/ @ts-expect-error.*\n/gm, ''));

  const output = await new Promise((done) => {
    let text = '';
    const child = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false', '-p', 'packages/core'], { cwd: ROOT });

    child.stdout.on('data', (data) => { text += data; });
    child.on('exit', () => done(text));
  });

  await rm(UNCHECKED, { force: true });

  const errors = output.split('\n').filter(line => line.includes('mistakes-unchecked.ts')).map(line => line.replace(/^.*mistakes-unchecked\.ts/, 'mistakes.ts'));

  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(errors));
}

// The pages, and the stylesheet and check runner they share.
const SHARED = new Map([['/try.css', 'text/css'], ['/harness.js', 'text/javascript']]);

async function page(name, response) {
  const file = SHARED.has(name) ? name.slice(1) : name === '/' ? 'index.html' : `${name.slice(1)}.html`;
  const type = SHARED.get(name) ?? 'text/html';

  if (!SHARED.has(name) && !/^[a-z0-9-]+\.html$/.test(file)) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(await readFile(join(ROOT, 'try', file)));
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
    const local = () => (path === '/compile-mistakes' ? compileMistakes(response) : path.startsWith('/files/') ? files(request, response, path) : page(path, response));
    const handled = route ? proxy(request, response, route[0], route[1]) : local();

    handled.catch(error => response.writeHead(502).end(String(error)));
  }).listen(PORTS.page);
}

function stopAll(code = 0) {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  process.exit(code);
}

// A crash must not leave the servers running on their ports for the next start.
process.on('uncaughtException', (error) => {
  console.error(error);
  stopAll(1);
});

await rm(STATE, { recursive: true, force: true });
await mkdir(join(STATE, 'workers'), { recursive: true });
await cp(CONTENT, LIVE_CONTENT, { recursive: true });
console.log('Venda try: building and starting both runtimes');

await step('build for Workers', 'pnpm', ['exec', 'nitro', 'build'], { VENDA_CONTENT_DIR: CONTENT });
await step('build for Node', 'pnpm', ['exec', 'nitro', 'build'], { NITRO_PRESET: 'node' });

const vars = Object.entries(OWNER_ENV).flatMap(([key, value]) => ['--var', `${key}:${value}`]);

serve('workers', 'npx', ['wrangler', 'dev', '--local', '--persist-to', join(STATE, 'workers'), '--config', '.output/server/wrangler.json', '--port', String(PORTS.workers), ...vars]);
serve('node', 'node', [join(SERVER, '.output-node/server/index.mjs')], { cwd: NODE_DIR, env: { PORT: String(PORTS.node), ...OWNER_ENV } });
process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());

await Promise.all([healthy(PORTS.workers), healthy(PORTS.node)]);
startPageServer();

console.log(`
  Open http://localhost:${PORTS.page}

  Owner: ${OWNER_ENV.VENDA_OWNER_EMAIL} / ${OWNER_ENV.VENDA_OWNER_PASSWORD} (local only)
  Workers (workerd + local D1/KV): http://localhost:${PORTS.workers}, content from try/content, bundled
  Node (node:sqlite + files):   http://localhost:${PORTS.node}, content from .try/node/content (edit freely)
  Logs: .try/*.log · Ctrl-C to stop
`);
