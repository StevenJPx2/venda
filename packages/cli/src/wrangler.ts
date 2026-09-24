import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  /** Written to the child's stdin (used for secrets so they never touch disk). */
  input?: string;
  /** Stream output to the terminal instead of capturing it (login, tail). */
  inherit?: boolean;
}

/** Seam over the Wrangler binary, so commands can be tested with a fake. */
export type Runner = (args: string[], options?: RunOptions) => Promise<RunResult>;

export class WranglerError extends Error {
  override name = 'WranglerError';
  constructor(readonly args: string[], readonly result: RunResult) {
    super(`wrangler ${args.join(' ')} failed (exit ${result.code}).\n${stripAnsi(result.stderr || result.stdout).trim().split('\n').slice(-12).join('\n')}`);
  }
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** Runs the Wrangler version the CLI depends on, scoped to one Cloudflare account. */
export function createRunner(accountId?: string): Runner {
  const wranglerMain = createRequire(import.meta.url).resolve('wrangler');
  const bin = join(dirname(dirname(wranglerMain)), 'bin', 'wrangler.js');

  return (args, options = {}) => new Promise((resolve, reject) => {
    const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}) };
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: options.cwd,
      env,
      stdio: options.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    if (!options.inherit) child.stdin?.end(options.input ?? '');
  });
}

/** Runs Wrangler and throws a readable error on a non-zero exit. */
export async function wrangler(runner: Runner, args: string[], options?: RunOptions): Promise<string> {
  const result = await runner(args, options);
  if (result.code !== 0) throw new WranglerError(args, result);
  return result.stdout;
}

/** Wrangler prints a banner before JSON on some commands; take the JSON part. */
export function extractJson(output: string): unknown {
  const text = stripAnsi(output);
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('Expected JSON from wrangler but got none.');
  return JSON.parse(text.slice(start));
}

export interface Account { id: string; name: string }
export interface Whoami { loggedIn: boolean; email?: string; accounts: Account[] }

export function parseWhoami(output: string): Whoami {
  const raw = extractJson(output) as { loggedIn?: boolean; email?: string; accounts?: { id?: string; name?: string }[] };
  const accounts = (raw.accounts ?? []).filter(a => a.id).map(a => ({ id: String(a.id), name: String(a.name ?? a.id) }));
  return { loggedIn: raw.loggedIn === true, ...(raw.email ? { email: raw.email } : {}), accounts };
}

export function parseD1List(output: string): { name: string; id: string }[] {
  return (extractJson(output) as { name: string; uuid: string }[]).map(db => ({ name: db.name, id: db.uuid }));
}

export function parseKvList(output: string): { title: string; id: string }[] {
  return (extractJson(output) as { title: string; id: string }[]).map(ns => ({ title: ns.title, id: ns.id }));
}

/** `wrangler r2 bucket list` prints `name: <bucket>` lines rather than JSON. */
export function parseR2List(output: string): string[] {
  return [...stripAnsi(output).matchAll(/^name:\s+(\S+)\s*$/gm)].map(match => match[1]!);
}

/** The public URL from `wrangler deploy` output: a custom domain or workers.dev. */
export function parseDeployUrl(output: string, domain?: string): string | undefined {
  if (domain) return `https://${domain}`;
  return stripAnsi(output).match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
}

/** True when `d1 migrations list` reports nothing left to apply. */
export function migrationsUpToDate(output: string): boolean {
  return /no migrations to apply/i.test(stripAnsi(output));
}
