// Shared harness for live end-to-end checks: builds and starts the real
// server on local workerd, and reports named checks.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveContent } from '../scripts/content-server.mjs';
import { simulateRepository } from '../scripts/github-simulator.mjs';

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

const CONTENT_PORT = 8796;

const children = [];
const closers = [];
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

/** Builds the Worker with the fixture content built in. */
export const buildWorkers = () =>
  run('pnpm', ['exec', 'nitro', 'build'], {
    VENDA_CONTENT_DIR: CONTENT_FIXTURES
  });

/** A fresh folder of local D1 and KV state; pass it to `startWorkers` again to restart on the same data. */
export const workersState = () => mkdtemp(join(tmpdir(), 'venda-e2e-'));

/** An editable copy of the fixture content, for a Worker started with `live`. */
export async function liveContent() {
  const dir = await mkdtemp(join(tmpdir(), 'venda-content-'));

  await cp(CONTENT_FIXTURES, dir, { recursive: true });

  return dir;
}

/**
 * Starts the built Worker on local workerd over `state`. With `live`, it reads
 * that folder through the content server, as `pnpm try` does, instead of the
 * built-in copy. Resolves to a function that stops both.
 */
export async function startWorkers(state, live) {
  const token = randomUUID();
  const stopContent = live
    ? await serveContent(live, CONTENT_PORT, token)
    : async () => {};
  const env = live
    ? {
        ...OWNER_ENV,
        VENDA_CONTENT_URL: `http://127.0.0.1:${CONTENT_PORT}/`,
        VENDA_CONTENT_TOKEN: token
      }
    : OWNER_ENV;
  const vars = Object.entries(env).flatMap(([key, value]) => [
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
  const stopBoth = async () => {
    await Promise.all([stop(child), stopContent()]);
  };

  closers.push(stopContent);
  await waitFor(`${WORKERS}/api/health`, 'Workers');

  return stopBoth;
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

const GITHUB_PORT = 8797;

export const GITHUB_AUTHOR_EMAIL = 'venda@users.noreply.venda.test';

/**
 * Starts the built Worker reading the fixture content from the GitHub
 * simulator, as a deployment reads its repository. Resolves to the simulator
 * and a function that stops both.
 */
export async function startGitHubWorkers(state) {
  const {
    github,
    webhookSecret,
    env: githubEnv
  } = await simulateRepository({
    folder: CONTENT_FIXTURES,
    port: GITHUB_PORT,
    authorEmail: GITHUB_AUTHOR_EMAIL
  });
  const env = { ...OWNER_ENV, ...githubEnv };
  // --test-scheduled exposes /cdn-cgi/local/scheduled, which runs the Cron Trigger.
  const child = start('workers', 'npx', [
    'wrangler',
    'dev',
    '--local',
    '--test-scheduled',
    '--persist-to',
    state,
    '--config',
    '.output/server/wrangler.json',
    '--port',
    '8795',
    ...Object.entries(env).flatMap(([key, value]) => [
      '--var',
      `${key}:${value}`
    ])
  ]);

  closers.push(github.stop);
  await waitFor(`${WORKERS}/api/health`, 'Workers');
  github.deliverTo(`${WORKERS}/api/webhooks/github`, webhookSecret);

  return {
    github,
    webhookSecret,
    /** Runs the minute check now, as the Cron Trigger would. */
    tick: () =>
      fetch(`${WORKERS}/cdn-cgi/local/scheduled?cron=*+*+*+*+*`).then(
        response => response.text()
      ),
    stop: async () => {
      await Promise.all([stop(child), github.stop()]);
    }
  };
}

/** Polls `read` until `test` passes, for up to `seconds`; resolves to the last read. */
export async function until(read, test, seconds = 10) {
  let last;

  for (const deadline = Date.now() + seconds * 1000; Date.now() < deadline;) {
    last = await read();

    if (test(last)) return last;

    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
  }

  return last;
}

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

    await Promise.allSettled(closers.map(close => close()));

    console.log(
      `# ${name} (${Math.round((Date.now() - started) / 1000)}s)\n${results.join('\n')}`
    );
    // Detached server pipes would otherwise keep the process alive.
    process.exit(process.exitCode ?? 0);
  }
}
