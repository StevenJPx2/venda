// Shared harness for live end-to-end checks: starts the real Worker (the Nitro
// server on wrangler + local D1), the admin and landing dev servers, and
// reports named checks.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Ports chosen to avoid the usual dev defaults (3000/8787).
export const PORTS = { api: 8795, admin: 3010, landing: 3011 };
export const API = `http://localhost:${PORTS.api}`;
export const ADMIN = `http://localhost:${PORTS.admin}`;
export const LANDING = `http://localhost:${PORTS.landing}`;
export const OWNER = { email: 'owner@example.com', password: 'recovery-password' };
const SERVER = `${ROOT}/packages/server`;
const SERVER_CONFIG = '.output/server/wrangler.json';

/** Content files for the file-first suites: the `field-notes` collection. */
export const CONTENT_FIXTURES = `${ROOT}/e2e/fixtures/content`;

const children = [];
const results = [];

export function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`);

  if (!ok) process.exitCode = 1;
}

const logs = new Map();

function start(cmd, args, cwd, env = {}, label = cmd) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';

  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  children.push(child);
  logs.set(label, () => log);

  return () => log;
}

function run(cmd, args, cwd, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

async function waitFor(url, label, getLog, seconds = 240) {
  for (let i = 0; i < seconds; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch { /* still starting */ }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error(`${label} did not start within ${seconds}s:\n${getLog().slice(-2000)}`);
}

/** Starts the API on a fresh migrated D1; returns once it answers. */
export async function startApi() {
  const state = await mkdtemp(join(tmpdir(), 'venda-e2e-'));
  // The Nitro server (packages/server), built for Workers with the fixture content
  // bundled; wrangler runs the build on local workerd.
  await run('pnpm', ['exec', 'nitro', 'build'], SERVER, { VENDA_CONTENT_DIR: CONTENT_FIXTURES });
  await run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'VENDA_DB', '--local', '--persist-to', state, '--config', SERVER_CONFIG], SERVER);
  const log = start('npx', ['wrangler', 'dev', '--local', '--persist-to', state, '--config', SERVER_CONFIG, '--port', String(PORTS.api),
    '--var', `ADMIN_EMAIL:${OWNER.email}`, '--var', `ADMIN_PASSWORD:${OWNER.password}`,
    '--var', 'SESSION_SECRET:e2e-secret', '--var', `ADMIN_ORIGINS:${ADMIN}`], SERVER, {}, 'api');
  await waitFor(`${API}/api/health`, 'API', log);
}

/** Fires the Worker's Cron Trigger through wrangler's local scheduled route. */
export async function fireCron() {
  const response = await fetch(`${API}/cdn-cgi/local/scheduled?cron=${encodeURIComponent('* * * * *')}`);

  if (!response.ok) throw new Error(`Cron trigger failed: ${response.status}`);
}

export async function startAdmin() {
  const log = start('pnpm', ['exec', 'nuxt', 'dev', '--port', String(PORTS.admin)], `${ROOT}/apps/admin`, { NUXT_PUBLIC_API_BASE: `${API}/api` }, 'admin');
  await waitFor(ADMIN, 'admin', log);
}

export async function startLanding() {
  const log = start('pnpm', ['exec', 'nuxt', 'dev', '--port', String(PORTS.landing)], `${ROOT}/apps/landing`, { NUXT_PUBLIC_VENDA_API_BASE: `${API}/api` }, 'landing');
  await waitFor(LANDING, 'landing', log);
}

/** Calls the API directly, optionally with a session cookie. */
export async function api(path, init = {}, cookie = '') {
  const res = await fetch(`${API}/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  return { res, body: await res.json().catch(() => null) };
}

export async function ownerCookie() {
  const { res, body } = await api('/auth/login', { method: 'POST', body: JSON.stringify(OWNER) });

  if (!res.ok) throw new Error(`Owner sign-in failed: ${res.status} ${JSON.stringify(body)}`);

  return res.headers.getSetCookie()[0].split(';')[0];
}

export async function signInAsOwner(page) {
  await page.goto(ADMIN, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('input[name="email"]').fill(OWNER.email);
  await page.locator('input[name="password"]').fill(OWNER.password);

  // Wait for the session cookie: navigating straight after the click can beat the login response.
  const [login] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in' }).click()
  ]);

  if (!login.ok()) throw new Error(`Owner sign-in failed: ${login.status()}`);
}

/** Runs a suite, always stopping servers and printing results. */
export async function suite(name, body) {
  const started = Date.now();

  try {
    await body();
  } catch (error) {
    results.push(`ERROR ${error instanceof Error ? error.stack : String(error)}`);

    // The servers' recent output usually says why a page never appeared.
    for (const [label, log] of logs) results.push(`--- ${label} log (last 1500 chars)\n${log().slice(-1500)}`);

    process.exitCode = 1;
  } finally {
    for (const child of children) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
    }

    console.log(`# ${name} (${Math.round((Date.now() - started) / 1000)}s)\n${results.join('\n')}`);
    // Detached server pipes would otherwise keep the process alive.
    process.exit(process.exitCode ?? 0);
  }
}
