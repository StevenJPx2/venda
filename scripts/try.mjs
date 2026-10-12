// `pnpm try`: builds the server, runs it on local workerd with an editable
// copy of the content served live, and serves the slice try pages (try/*.html)
// on one origin. Ctrl-C stops everything.
//
// The local database and sessions (.try/data) are kept between runs, so you
// stay signed in; the build and the content copy start fresh every time.
// `pnpm try --fresh` wipes everything first.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveContent } from './content-server.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SERVER = join(ROOT, 'packages/server');
const STATE = join(ROOT, '.try');
// D1 and KV under wrangler: people, tokens and sessions.
const DATA = join(STATE, 'data');
const FRESH = process.argv.includes('--fresh');
// Built into the Worker as its fallback; the Worker reads the editable copy in
// .try/content through the content server, so an edit shows on the next request.
const CONTENT = join(ROOT, 'try/content');
const LIVE_CONTENT = join(STATE, 'content');
const CONTENT_FILE = /^\/files\/(site\.ts|[a-z0-9-]+\/[a-z0-9-]+\.mdx?)$/;
const PORTS = { page: 8794, server: 8805, content: 8806 };
// Its own build output, so `pnpm e2e` or a manual build cannot replace files this server is serving.
const BUILD = join(STATE, 'build');
// Throwaway local credentials for the recovery owner, for this machine only.
const OWNER_ENV = {
  VENDA_OWNER_EMAIL: 'owner@venda.local',
  VENDA_OWNER_PASSWORD: 'try-venda-owner'
};
const children = [];

function spawnLogged(name, command, args, options = {}) {
  const log = createWriteStream(join(STATE, `${name}.log`));
  const child = spawn(command, args, {
    cwd: SERVER,
    detached: true,
    ...options,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.pipe(log);
  child.stderr.pipe(log);

  return child;
}

function step(label, command, args, env) {
  process.stdout.write(`  ${label}… `);

  return new Promise((done, fail) => {
    spawnLogged(label.replaceAll(' ', '-'), command, args, { env }).once(
      'exit',
      code => {
        if (code === 0) {
          console.log('done');
          done();
          return;
        }

        console.log(`failed (see .try/${label.replaceAll(' ', '-')}.log)`);
        fail(new Error(`${label} failed`));
      }
    );
  });
}

function serve(name, command, args, options = {}) {
  children.push(spawnLogged(name, command, args, options));
}

async function healthy(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (
      await fetch(`http://localhost:${port}/api/health`).then(
        r => r.ok,
        () => false
      )
    )
      return;

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Nothing answered on port ${port}; see .try/*.log`);
}

// One cookie jar per person, kept here rather than in the browser, so a single
// page can act as several people (`x-try-as: owner`). The browser cannot read
// HttpOnly cookies, so the Set-Cookie the server sent is echoed in
// `x-try-set-cookie` for the page to show.
const jars = new Map();

const TRY_HEADERS = new Set([
  'host',
  'origin',
  'cookie',
  'x-try-as',
  'x-try-origin'
]);

async function proxy(request, response) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  const jar = request.headers['x-try-as'] ?? 'anonymous';
  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(([key]) => !TRY_HEADERS.has(key))
  );

  if (jars.has(jar)) headers.cookie = jars.get(jar);

  // The page is same-origin in spirit; `x-try-origin` plays a request from another site.
  if (request.headers['x-try-origin'])
    headers.origin = request.headers['x-try-origin'];

  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : Buffer.concat(chunks);
  const upstream = await fetch(
    `http://localhost:${PORTS.server}${request.url}`,
    { method: request.method, headers, body, redirect: 'manual' }
  );
  const out = {};
  const setCookie = upstream.headers.getSetCookie();

  for (const cookie of setCookie) jars.set(jar, cookie.split(';')[0]);

  upstream.headers.forEach((value, key) => {
    if (
      key !== 'content-encoding' &&
      key !== 'content-length' &&
      key !== 'set-cookie'
    )
      out[key] = value;
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
  await writeFile(
    UNCHECKED,
    (await readFile(MISTAKES, 'utf8')).replaceAll(
      /^\s*\/\/ @ts-expect-error.*\n/gm,
      ''
    )
  );

  const output = await new Promise(done => {
    let text = '';
    const child = spawn(
      'npx',
      ['tsc', '--noEmit', '--pretty', 'false', '-p', 'packages/core'],
      { cwd: ROOT }
    );

    child.stdout.on('data', data => {
      text += data;
    });
    child.on('exit', () => done(text));
  });

  await rm(UNCHECKED, { force: true });

  const errors = output
    .split('\n')
    .filter(line => line.includes('mistakes-unchecked.ts'))
    .map(line => line.replace(/^.*mistakes-unchecked\.ts/, 'mistakes.ts'));

  response
    .writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify(errors));
}

// The pages, and the stylesheet and check runner they share.
const SHARED = new Map([
  ['/try.css', 'text/css'],
  ['/harness.js', 'text/javascript']
]);

async function page(name, response) {
  const file = SHARED.has(name)
    ? name.slice(1)
    : name === '/'
      ? 'index.html'
      : `${name.slice(1)}.html`;
  const type = SHARED.get(name) ?? 'text/html';

  if (!SHARED.has(name) && !/^[a-z0-9-]+\.html$/.test(file)) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    response
      .writeHead(200, {
        'content-type': `${type}; charset=utf-8`,
        'cache-control': 'no-store'
      })
      .end(await readFile(join(ROOT, 'try', file)));
  } catch {
    response.writeHead(404).end('Not found');
  }
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf8');
}

// A local-only helper for the try pages: read, write and remove the live
// content files, as an agent or a developer editing the folder would.
async function files(request, response, path) {
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

  if (request.method === 'DELETE') {
    await rm(join(LIVE_CONTENT, file), { force: true });
    response.writeHead(204).end();
    return;
  }

  const text = await readFile(join(LIVE_CONTENT, file), 'utf8').catch(
    () => null
  );

  response
    .writeHead(text === null ? 404 : 200, {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'no-store'
    })
    .end(text ?? 'Not found');
}

function startPageServer() {
  createServer((request, response) => {
    const url = request.url ?? '/';
    const path = url.split('?')[0];
    const local = () =>
      path === '/compile-mistakes'
        ? compileMistakes(response)
        : path.startsWith('/files/')
          ? files(request, response, path)
          : page(path, response);
    // The API and the admin belong to the Venda server; everything else is this page server.
    const handled = /^\/(api|admin)\//.test(url)
      ? proxy(request, response)
      : local();

    handled.catch(error => response.writeHead(502).end(String(error)));
  }).listen(PORTS.page);
}

function stopAll(code = 0) {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }

  process.exit(code);
}

// A crash must not leave the servers running on their ports for the next start.
process.on('uncaughtException', error => {
  console.error(error);
  stopAll(1);
});

// Everything in .try/ except the data is rebuilt each run; --fresh drops the data too.
for (const entry of await readdir(STATE).catch(() => []))
  if (FRESH || join(STATE, entry) !== DATA)
    await rm(join(STATE, entry), { recursive: true, force: true });

await mkdir(DATA, { recursive: true });
await cp(CONTENT, LIVE_CONTENT, { recursive: true });
console.log('Venda try: building and starting the server');

await step('build admin', 'pnpm', ['--filter', '@venda/admin-app', 'build']);
await step('build the Worker', 'pnpm', ['exec', 'nitro', 'build'], {
  VENDA_CONTENT_DIR: CONTENT,
  VENDA_OUTPUT_DIR: BUILD
});

const contentToken = randomUUID();
const stopContent = await serveContent(
  LIVE_CONTENT,
  PORTS.content,
  contentToken
);
const vars = Object.entries({
  ...OWNER_ENV,
  VENDA_CONTENT_URL: `http://127.0.0.1:${PORTS.content}/`,
  VENDA_CONTENT_TOKEN: contentToken
}).flatMap(([key, value]) => ['--var', `${key}:${value}`]);

serve('server', 'npx', [
  'wrangler',
  'dev',
  '--local',
  '--persist-to',
  DATA,
  '--config',
  join(BUILD, 'server/wrangler.json'),
  '--port',
  String(PORTS.server),
  ...vars
]);
process.on('SIGINT', () => stopContent().finally(() => stopAll()));
process.on('SIGTERM', () => stopContent().finally(() => stopAll()));

await healthy(PORTS.server);
startPageServer();

console.log(`
  Open http://localhost:${PORTS.page}

  Owner: ${OWNER_ENV.VENDA_OWNER_EMAIL} / ${OWNER_ENV.VENDA_OWNER_PASSWORD} (local only)
  Admin: http://localhost:${PORTS.server}/admin/
  Server: Cloudflare Workers on local workerd, with local D1 and KV
  Content: .try/content, live. Edit any file; the next request serves it.
  Data: .try/data, kept between runs, so you stay signed in. \`pnpm try --fresh\` starts clean.
  Logs: .try/*.log · Ctrl-C to stop
`);
