// `pnpm try`: builds the server, runs it on local workerd and D1, and serves
// the slice try pages (try/*.html) on one origin. Ctrl-C stops everything.
//
// The local database (.try/data: content, people, sessions) is kept between
// runs, so you stay signed in and your edits stay; an empty database gets
// try/content imported. `pnpm try --fresh` wipes everything first.
import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SERVER = join(ROOT, 'packages/server');
const STATE = join(ROOT, '.try');
// D1 and KV under wrangler: content, people, tokens and sessions.
const DATA = join(STATE, 'data');
const FRESH = process.argv.includes('--fresh');
// Imported into an empty database.
const CONTENT = join(ROOT, 'try/content');
const CONTENT_FILE = /^\/files\/(site\.ts|[a-z0-9-]+\/[a-z0-9-]+\.mdx?)$/;
// The built `venda` the slice 4 page runs, in a scratch home (.try/cli) with a
// folder an agent works in (.try/cli/agent), signed in with an owner's token
// kept in .try/data so it survives runs with the database it belongs to.
const CLI = join(ROOT, 'packages/cli/dist/venda.mjs');
const CLI_HOME = join(STATE, 'cli');
const CLI_TOKEN = join(DATA, 'cli-token');
// scratch.md is not content: a body for `venda entry set --markdown`.
const AGENT_FILE =
  /^\/cli\/agent\/(site\.ts|scratch\.md|[a-z0-9-]+\/(?:config\.ts|[a-z0-9-]+\.mdx?))$/;
const PORTS = { page: 8794, server: 8805 };
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

// Builds join the children too, so Ctrl-C during one stops it: a build left
// running would hold Nuxt's build lock and fail the next `pnpm try`.
function step(label, command, args, env) {
  process.stdout.write(`  ${label}… `);

  return new Promise((done, fail) => {
    const child = spawnLogged(label.replaceAll(' ', '-'), command, args, {
      env
    });

    children.push(child);
    child.once('exit', code => {
      children.splice(children.indexOf(child), 1);

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

const markdown = (response, text) =>
  response
    .writeHead(text === null ? 404 : 200, {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'no-store'
    })
    .end(text ?? 'Not found');

// The owner's session for this page server's own calls: seeding and the
// /files/ helper.
let ownerCookie = '';

async function asOwner(path, body) {
  const call = () =>
    fetch(`http://localhost:${PORTS.server}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  let answer = await call();

  if (answer.status === 401) {
    const signedIn = await fetch(
      `http://localhost:${PORTS.server}/api/auth/sign-in`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: OWNER_ENV.VENDA_OWNER_EMAIL,
          password: OWNER_ENV.VENDA_OWNER_PASSWORD
        })
      }
    );

    ownerCookie = signedIn.headers.getSetCookie()[0]?.split(';')[0] ?? '';
    answer = await call();
  }

  return answer;
}

const fileAt = async path => {
  const answer = await asOwner(
    `/admin/files/read?path=${encodeURIComponent(path)}`
  );

  return answer.ok ? answer.json() : null;
};

// A local-only helper for the try pages: read, change and remove content
// files through the files API, as an agent or `venda push` would.
async function files(request, response, path) {
  const file = CONTENT_FILE.exec(path)?.[1];

  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }

  if (request.method === 'GET')
    return markdown(response, (await fileAt(file))?.text ?? null);

  const written = await asOwner('/admin/files', {
    message: 'Edited from the try page',
    changes: [
      {
        path: file,
        text: request.method === 'PUT' ? await readBody(request) : null,
        baseSha: (await fileAt(file))?.sha ?? null
      }
    ]
  });

  if (written.ok) return void response.writeHead(204).end();

  response
    .writeHead(written.status, { 'content-type': 'application/json' })
    .end(await written.text());
}

/** try/content as `{ path, text }`. */
async function tryContent() {
  const entries = await readdir(CONTENT, {
    recursive: true,
    withFileTypes: true
  });

  return Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(async entry => {
        const path = join(entry.parentPath, entry.name);

        return {
          path: relative(CONTENT, path).split(sep).join('/'),
          text: await readFile(path, 'utf8')
        };
      })
  );
}

/** Imports try/content into an empty database; a kept one keeps its edits. */
async function seed() {
  const listed = await (await asOwner('/admin/files')).json();

  if (listed.length > 0) return 'kept';

  const all = await tryContent();

  for (let at = 0; at < all.length; at += 200) {
    const answer = await asOwner('/admin/import', {
      files: all.slice(at, at + 200)
    });

    if (!answer.ok) throw new Error(`Import answered ${answer.status}`);
  }

  return 'imported';
}

let cliToken = '';

/** An owner's API token for the page's `venda`: the kept one while the site still takes it. */
async function cliLogin() {
  const kept = await readFile(CLI_TOKEN, 'utf8').catch(() => '');
  const valid =
    kept &&
    (
      await fetch(`http://localhost:${PORTS.server}/api/auth/me`, {
        headers: { authorization: `Bearer ${kept}` }
      })
    ).ok;

  cliToken = valid
    ? kept
    : (await (await asOwner('/tokens', { name: 'Try page CLI' })).json())
        .secret;
  await writeFile(CLI_TOKEN, cliToken, { mode: 0o600 });
  await mkdir(join(CLI_HOME, 'agent'), { recursive: true });
}

const json = (response, status, value) =>
  response
    .writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    })
    .end(JSON.stringify(value));

/** Runs the built `venda` in .try/cli, as an agent would. */
async function runCli(request, response) {
  const { args } = JSON.parse(await readBody(request));

  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string'))
    return json(response, 400, { error: 'args must be a list of strings' });

  const result = await new Promise(done =>
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: CLI_HOME,
        env: {
          ...process.env,
          VENDA_URL: `http://localhost:${PORTS.server}`,
          VENDA_TOKEN: cliToken,
          XDG_CONFIG_HOME: join(CLI_HOME, 'config')
        }
      },
      (error, out, err) =>
        done({ code: error ? (error.code ?? 1) : 0, out, err })
    )
  );

  json(response, 200, { command: `venda ${args.join(' ')}`, ...result });
}

/** The agent's folder, file by file: what it pulled, and its own edits. */
async function agentFile(request, response, path) {
  const file = AGENT_FILE.exec(path)?.[1];

  if (!file) return void response.writeHead(404).end('Not found');

  const full = join(CLI_HOME, 'agent', ...file.split('/'));

  if (request.method === 'PUT') {
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, await readBody(request));

    return void response.writeHead(204).end();
  }

  markdown(response, await readFile(full, 'utf8').catch(() => null));
}

/** The page server's own routes for the CLI. */
const cliRoute = (request, response, path) =>
  path === '/cli/run'
    ? runCli(request, response)
    : path === '/cli/login'
      ? Promise.resolve(
          json(response, 200, {
            url: `http://localhost:${PORTS.server}`,
            token: cliToken
          })
        )
      : agentFile(request, response, path);

function startPageServer() {
  createServer((request, response) => {
    const url = request.url ?? '/';
    const path = url.split('?')[0];
    const local = () =>
      path === '/compile-mistakes'
        ? compileMistakes(response)
        : path.startsWith('/files/')
          ? files(request, response, path)
          : path.startsWith('/cli/')
            ? cliRoute(request, response, path)
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

// Another `pnpm try` already serving would lose its build to the cleanup below.
const portInUse = port =>
  fetch(`http://127.0.0.1:${port}/`).then(
    () => true,
    () => false
  );

if ((await portInUse(PORTS.page)) || (await portInUse(PORTS.server))) {
  console.error(
    `pnpm try is already running: open http://localhost:${PORTS.page}, or stop it (Ctrl-C in its terminal) before starting another.`
  );
  process.exit(1);
}

// Stopping at any point, even mid-build, stops everything this run started.
process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());

// Everything in .try/ except the data is rebuilt each run; --fresh drops the data too.
for (const entry of await readdir(STATE).catch(() => []))
  if (FRESH || join(STATE, entry) !== DATA)
    await rm(join(STATE, entry), { recursive: true, force: true });

await mkdir(DATA, { recursive: true });
console.log('Venda try: building and starting the server');

await step('build admin', 'pnpm', ['--filter', '@venda/admin-app', 'build']);
await step('build the Worker', 'pnpm', ['exec', 'nitro', 'build'], {
  VENDA_OUTPUT_DIR: BUILD
});
await step('build the CLI', 'pnpm', ['--filter', '@venda/cli', 'build']);

const vars = Object.entries(OWNER_ENV).flatMap(([key, value]) => [
  '--var',
  `${key}:${value}`
]);

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

await healthy(PORTS.server);

const seeded = await seed();

await cliLogin();
startPageServer();

console.log(`
  Open http://localhost:${PORTS.page}

  Owner: ${OWNER_ENV.VENDA_OWNER_EMAIL} / ${OWNER_ENV.VENDA_OWNER_PASSWORD} (local only)
  Admin: http://localhost:${PORTS.server}/admin/
  Server: Cloudflare Workers on local workerd, with local D1 and KV
  Content: in D1, ${
    seeded === 'imported'
      ? 'imported from try/content just now'
      : 'as you left it (`pnpm try --fresh` imports try/content again)'
  }
  CLI: VENDA_URL=http://localhost:${PORTS.server} VENDA_TOKEN=${cliToken} pnpm venda pull ./my-content
  Data: .try/data, kept between runs, so you stay signed in. \`pnpm try --fresh\` starts clean.
  Logs: .try/*.log · Ctrl-C to stop
`);
