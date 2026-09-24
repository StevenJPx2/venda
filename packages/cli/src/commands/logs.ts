import { resolve } from 'node:path';
import { loadProject } from '../project.js';
import { p } from '../ui.js';
import { createRunner, wrangler } from '../wrangler.js';
import type { Flags } from '../flags.js';

export async function logs(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  p.intro(`Venda · live logs for ${project.name}`);
  p.log.info('Press Ctrl+C to stop tailing.');
  await wrangler(createRunner(project.accountId), ['tail'], { cwd: dir, inherit: true });
}
