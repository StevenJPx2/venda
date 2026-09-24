import { resolve } from 'node:path';
import { waitForHealth } from '../deploy.js';
import { loadProject } from '../project.js';
import { cliVersion } from '../release.js';
import { p } from '../ui.js';
import type { Flags } from '../flags.js';

export async function status(flags: Flags): Promise<void> {
  const project = await loadProject(resolve(flags.dir));
  const release = await cliVersion();
  const health = project.url ? await waitForHealth(project.url, 8_000) : { ok: false as const };

  p.intro(`Venda · ${project.name}`);
  p.note([
    `Worker       ${project.name}`,
    `Account      ${project.accountId}`,
    `Admin email  ${project.adminEmail}`,
    `Admin URL    ${project.url ?? 'not deployed'}`,
    `Worker       ${health.ok ? `online · v${health.version ?? 'unknown'}` : 'offline or not deployed'}`,
    `Installed    ${project.version ? `v${project.version}` : 'not deployed'}`,
    `CLI release  v${release}`,
    ...(project.resources ? [
      `D1           ${project.resources.d1.name} (${project.resources.d1.id})`,
      `KV           ${project.resources.kv.title} (${project.resources.kv.id})`,
      `R2           ${project.resources.r2.name}`
    ] : ['Resources    not provisioned'])
  ].join('\n'), 'Install status');
  p.outro(health.ok ? 'Online' : 'Run `venda doctor` for diagnostics');
}
