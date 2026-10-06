// Shared harness for live end-to-end checks: builds and starts the real
// server (on local workerd, or on Node) and reports named checks.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SERVER = `${ROOT}/packages/server`;

/** Content files for the suites: the `field-notes` collection. */
export const CONTENT_FIXTURES = `${ROOT}/e2e/fixtures/content`;

const children = [];
const results = [];
const logs = new Map();

export function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`);

  if (!ok) process.exitCode = 1;
}

/** Starts a long-running process whose output is shown if the suite fails. */
export function start(label, cmd, args, { cwd = SERVER, env = {} } = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';

  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  children.push(child);
  logs.set(label, () => log);

  return child;
}

/** Runs a command to completion in the server package. */
export function run(cmd, args, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd: SERVER, env: { ...process.env, ...env }, stdio: 'ignore' });

    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

/** Resolves once `url` answers, or fails after `seconds`. */
export async function waitFor(url, label, seconds = 240) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await fetch(url).then(response => response.status < 500, () => false)) return;

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`${label} did not start within ${seconds}s`);
}

/** Sends SIGTERM; resolves true if the process exits within `seconds`, else kills it and resolves false. */
export const stop = (child, seconds = 10) => new Promise((resolvePromise) => {
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

/** Runs a suite, always stopping servers and printing results. */
export async function suite(name, body) {
  const started = Date.now();

  try {
    await body();
  } catch (error) {
    results.push(`ERROR ${error instanceof Error ? error.stack : String(error)}`);

    // The servers' recent output usually says why something never answered.
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
