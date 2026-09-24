import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareRelease, waitForHealth } from '../deploy.js';
import { loadProject, type VendaProject } from '../project.js';
import { checkResources } from '../provision.js';
import { cliVersion, releasePath } from '../release.js';
import { p } from '../ui.js';
import { createRunner, migrationsUpToDate, parseWhoami, type Runner } from '../wrangler.js';
import type { Flags } from '../flags.js';

interface Check { name: string; ok: boolean; detail: string; fix?: string }

function nodeCheck(): Check {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const ok = major > 20 || (major === 20 && minor >= 12);
  return { name: 'Node.js', ok, detail: `v${process.versions.node}`, ...(ok ? {} : { fix: 'Install Node.js 20.12 or newer.' }) };
}

async function authCheck(runner: Runner, project: VendaProject): Promise<Check> {
  const who = parseWhoami((await runner(['whoami', '--json'])).stdout || '{}');
  if (!who.loggedIn) return { name: 'Cloudflare login', ok: false, detail: 'not signed in', fix: 'Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN.' };
  const ok = who.accounts.some(a => a.id === project.accountId);
  return { name: 'Cloudflare login', ok, detail: ok ? `${who.email ?? 'signed in'} · account ${project.accountId}` : `no access to account ${project.accountId}`, ...(ok ? {} : { fix: 'Sign in with a user or token that can access this account.' }) };
}

async function resourceChecks(runner: Runner, project: VendaProject): Promise<Check[]> {
  if (!project.resources) return [{ name: 'Resources', ok: false, detail: 'not created', fix: 'Finish setup with `venda init`.' }];
  let health;
  try {
    health = await checkResources(runner, project.resources);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'could not list Cloudflare resources';
    return [{ name: 'Cloudflare resources', ok: false, detail, fix: 'Check your account permissions, then rerun `venda doctor`.' }];
  }
  const missing = (label: string, ok: boolean): Check => ({ name: label, ok, detail: ok ? 'present' : 'missing', ...(ok ? {} : { fix: 'It was deleted outside Venda. Restore from `venda backup`, or re-create with `venda init` in a new directory.' }) });
  return [missing(`D1 ${project.resources.d1.name}`, health.d1), missing(`KV ${project.resources.kv.title}`, health.kv), missing(`R2 ${project.resources.r2.name}`, health.r2)];
}

async function migrationCheck(runner: Runner, dir: string, project: VendaProject): Promise<Check> {
  await prepareRelease(dir, project);
  const result = await runner(['d1', 'migrations', 'list', 'VENDA_DB', '--remote'], { cwd: dir });
  const ok = result.code === 0 && migrationsUpToDate(result.stdout + result.stderr);
  return { name: 'Database migrations', ok, detail: ok ? 'up to date' : 'pending or unknown', ...(ok ? {} : { fix: 'Run `venda migrate`.' }) };
}

async function healthCheck(project: VendaProject, version: string): Promise<Check> {
  if (!project.url) return { name: 'Worker', ok: false, detail: 'never deployed', fix: 'Run `venda deploy`.' };
  const health = await waitForHealth(project.url, 10_000);
  if (!health.ok) return { name: 'Worker', ok: false, detail: `${project.url} is not answering`, fix: 'Run `venda deploy`, then `venda logs` to see errors.' };
  const current = health.version === version;
  return { name: 'Worker', ok: true, detail: `${project.url} · v${health.version}${current ? '' : ` (this CLI ships v${version}; run \`venda update\`)`}` };
}

export async function doctor(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  p.intro('Venda · doctor');
  const project = await loadProject(dir);
  const runner = createRunner(project.accountId);
  const version = await cliVersion();

  const checks: Check[] = [nodeCheck(), { name: 'Config', ok: true, detail: `${project.name} (${join(dir, 'venda.json')})` }];
  const auth = await authCheck(runner, project);
  checks.push(auth);
  if (auth.ok) {
    const resources = await resourceChecks(runner, project);
    checks.push(...resources);
    if (project.resources && resources.every(check => check.ok)) {
      try {
        checks.push(await migrationCheck(runner, dir, project));
      } catch (error) {
        checks.push({ name: 'Database migrations', ok: false, detail: error instanceof Error ? error.message : 'could not inspect migrations', fix: 'Run `venda migrate` after restoring Cloudflare access.' });
      }
    }
  }
  checks.push(await healthCheck(project, version));

  for (const check of checks) {
    const line = `${check.name} — ${check.detail}`;
    if (check.ok) p.log.success(line);
    else p.log.error(`${line}\n  → ${check.fix ?? ''}`);
  }

  const failed = checks.filter(c => !c.ok).length;
  p.outro(failed ? `${failed} problem${failed === 1 ? '' : 's'} found` : 'Everything looks good');
  if (failed) process.exitCode = 1;
}

/** Quick check used by `status`: is the recorded release still unpacked? */
export async function releaseInstalled(dir: string, version: string | undefined): Promise<boolean> {
  if (!version) return false;
  try {
    await access(join(dir, releasePath(version), 'worker', 'index.js'));
    return true;
  } catch {
    return false;
  }
}
