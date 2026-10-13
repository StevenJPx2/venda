// Shared harness for live end-to-end checks: builds and starts the real
// server on local workerd, and reports named checks.
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SERVER = `${ROOT}/packages/server`;

/** Content files for the suites: the `field-notes` collection. */
export const CONTENT_FIXTURES = `${ROOT}/e2e/fixtures/content`;

/** The recovery owner every suite's server is started with. */
export const OWNER = {
  email: 'owner@venda.test',
  password: 'recovery-password'
};

const OWNER_ENV = {
  VENDA_OWNER_EMAIL: OWNER.email,
  VENDA_OWNER_PASSWORD: OWNER.password
};

export const WORKERS = 'http://localhost:8795';

const children = [];
const results = [];
const logs = new Map();

export function check(name, ok, detail = '') {
  results.push(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`
  );

  if (!ok) process.exitCode = 1;
}

/** Starts a long-running process whose output is shown if the suite fails. */
export function start(label, cmd, args, { cwd = SERVER, env = {} } = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let log = '';

  child.stdout.on('data', data => {
    log += data;
  });
  child.stderr.on('data', data => {
    log += data;
  });
  children.push(child);
  logs.set(label, () => log);

  return child;
}

/** Runs a command to completion in the server package. */
export function run(cmd, args, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: SERVER,
      env: { ...process.env, ...env },
      stdio: 'ignore'
    });

    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
}

/** Resolves once `url` answers, or fails after `seconds`. */
export async function waitFor(url, label, seconds = 240) {
  for (let i = 0; i < seconds * 2; i++) {
    if (
      await fetch(url).then(
        response => response.status < 500,
        () => false
      )
    )
      return;

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`${label} did not start within ${seconds}s`);
}

/** Sends SIGTERM; resolves true if the process exits within `seconds`, else kills it and resolves false. */
export const stop = (child, seconds = 10) =>
  new Promise(resolvePromise => {
    const timer = setTimeout(() => {
      process.kill(-child.pid, 'SIGKILL');
      resolvePromise(false);
    }, seconds * 1000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
    process.kill(-child.pid, 'SIGTERM');
  });

/** Builds the Worker. */
export const buildWorkers = () => run('pnpm', ['exec', 'nitro', 'build']);

/** A fresh folder of local D1 and KV state; pass it to `startWorkers` again to restart on the same data. */
export const workersState = () => mkdtemp(join(tmpdir(), 'venda-e2e-'));

/** The fixture content as `{ path, text }`, with `extra` added (path → text). */
async function fixtureFiles(extra = new Map()) {
  const entries = await readdir(CONTENT_FIXTURES, {
    recursive: true,
    withFileTypes: true
  });
  const files = new Map();

  for (const entry of entries.filter(each => each.isFile())) {
    const path = join(entry.parentPath, entry.name);

    files.set(
      relative(CONTENT_FIXTURES, path).split(sep).join('/'),
      await readFile(path, 'utf8')
    );
  }

  for (const [path, text] of extra) files.set(path, text);

  return [...files].map(([path, text]) => ({ path, text }));
}

/** Imports `files` as the owner, 200 at a time, as `venda import` does. */
async function importFiles(files) {
  const api = await signedIn();

  for (let at = 0; at < files.length; at += 200) {
    const answer = await api('/admin/import', 'POST', {
      files: files.slice(at, at + 200)
    });

    if (answer.status !== 200)
      throw new Error(`Import answered ${answer.status}`);
  }
}

/**
 * Starts the built Worker on local workerd over `state`, with the fixture
 * content (and `extra` files) imported into an empty database. Resolves to a
 * function that stops it.
 */
export async function startWorkers(state, extra) {
  const vars = Object.entries(OWNER_ENV).flatMap(([key, value]) => [
    '--var',
    `${key}:${value}`
  ]);
  const child = start('workers', 'npx', [
    'wrangler',
    'dev',
    '--local',
    '--persist-to',
    state,
    '--config',
    '.output/server/wrangler.json',
    '--port',
    '8795',
    ...vars
  ]);

  await waitFor(`${WORKERS}/api/health`, 'Workers');

  const api = await signedIn();

  if ((await api('/admin/files')).json.length === 0)
    await importFiles(await fixtureFiles(extra));

  return () => stop(child);
}

/**
 * The content files through the files API, as the owner: what the suites
 * read to see what a publish wrote, and change as someone else would.
 */
export async function contentFiles() {
  const api = await signedIn();
  const read = async path => {
    const answer = await api(
      `/admin/files/read?path=${encodeURIComponent(path)}`
    );

    return answer.status === 200 ? answer.json : null;
  };

  return {
    read: async path => (await read(path))?.text ?? null,
    exists: async path => (await read(path)) !== null,
    /** Someone else's change, from whatever the file is now; null deletes. */
    write: async (path, text) => {
      const answer = await api('/admin/files', 'POST', {
        message: 'An outside change',
        changes: [{ path, text, baseSha: (await read(path))?.sha ?? null }]
      });

      if (answer.status !== 200)
        throw new Error(
          `Write answered ${answer.status}: ${JSON.stringify(answer.json)}`
        );
    }
  };
}

/** An API client that keeps the session cookie it is given. */
export function client() {
  let cookie = '';

  return async (path, method = 'GET', body, origin) => {
    const headers = { cookie, 'content-type': 'application/json' };

    if (origin) headers.origin = origin;

    const init = { method, headers };

    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await fetch(`${WORKERS}/api${path}`, init);
    const session = response.headers
      .getSetCookie()
      .find(value => value.startsWith('venda_session='));

    if (session) cookie = session.split(';')[0];

    // A server error may have no body.
    const text = await response.text();

    return { status: response.status, json: text ? JSON.parse(text) : null };
  };
}

/** A client signed in as the recovery owner. */
export async function signedIn() {
  const api = client();
  const answer = await api('/auth/sign-in', 'POST', OWNER);

  if (answer.status !== 200)
    throw new Error(`Sign-in answered ${answer.status}`);

  return api;
}

/** A save of `copy` with a new title. */
export const saveBody = (copy, title) => ({
  revision: copy.revision,
  data: { ...copy.data, title },
  publishedAt: copy.publishedAt
});

/** Runs a suite, always stopping servers and printing results. */
export async function suite(name, body) {
  const started = Date.now();

  try {
    await body();
  } catch (error) {
    results.push(
      `ERROR ${error instanceof Error ? error.stack : String(error)}`
    );

    // The servers' recent output usually says why something never answered.
    for (const [label, log] of logs)
      results.push(`--- ${label} log (last 1500 chars)\n${log().slice(-1500)}`);

    process.exitCode = 1;
  } finally {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already exited */
      }
    }

    console.log(
      `# ${name} (${Math.round((Date.now() - started) / 1000)}s)\n${results.join('\n')}`
    );
    // Detached server pipes would otherwise keep the process alive.
    process.exit(process.exitCode ?? 0);
  }
}
