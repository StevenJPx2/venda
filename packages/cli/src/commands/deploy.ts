import { resolve } from 'node:path';
import { applyMigrations, deployRelease, prepareRelease, waitForHealth } from '../deploy.js';
import { loadProject } from '../project.js';
import { cliVersion } from '../release.js';
import { UsageError, confirmOption, p, step } from '../ui.js';
import { createRunner } from '../wrangler.js';
import type { Flags } from '../flags.js';

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** `venda deploy` redeploys; `venda update` is the same with an upgrade summary. */
export async function deploy(flags: Flags, mode: 'deploy' | 'update'): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  const version = await cliVersion();
  p.intro(mode === 'update' ? `Venda · update ${project.name}` : `Venda · deploy ${project.name}`);

  if (project.version && compareVersions(version, project.version) < 0) {
    // Code can roll back; D1 migrations are forward-only, so warn before a downgrade.
    const ok = await confirmOption({ flag: flags.yes ? true : undefined, noPrompt: flags.noPrompt, initialValue: false, message: `This CLI ships v${version}, older than the deployed v${project.version}. Roll back anyway? Database migrations are not reverted.` });
    if (!ok) throw new UsageError('Rollback cancelled. Pass --yes to confirm a downgrade.');
  } else if (mode === 'update' && project.version === version) {
    p.log.info(`Already on v${version}. To get a newer release run \`npx venda@latest update\`. Redeploying anyway.`);
  }

  const runner = createRunner(project.accountId);
  const result = await step('Deploying', update => deployRelease(runner, dir, project, update), r => `Deployed v${r.version}`);
  const health = await step('Checking health', () => waitForHealth(result.url, 60_000), h => (h.ok ? `Healthy (v${h.version ?? '?'})` : 'Not answering yet'));

  if (result.previousVersion) p.log.success(`Updated v${result.previousVersion} → v${result.version}`);
  if (!health.ok) p.log.warn('Deployed, but /api/health did not answer. Run `venda doctor`.');
  p.outro(result.url);
}

export async function migrate(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  p.intro(`Venda · migrate ${project.name}`);
  const runner = createRunner(project.accountId);
  await step('Applying database migrations', async () => {
    await prepareRelease(dir, project);
    await applyMigrations(runner, dir);
  }, () => 'Database is up to date');
  p.outro('Done');
}
