import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadProject } from '../project.js';
import { p, step } from '../ui.js';
import { createRunner, wrangler } from '../wrangler.js';
import type { Flags } from '../flags.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

export async function backup(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  if (!project.resources) throw new Error('This install has no D1 database to back up.');
  const output = resolve(dir, flags.output ?? `backups/${project.name}-${timestamp()}.sql`);
  if (await exists(output)) throw new Error(`Refusing to overwrite ${output}. Choose another path with --output.`);

  p.intro(`Venda · backup ${project.name}`);
  await mkdir(dirname(output), { recursive: true });
  await step('Exporting remote D1 database', () => wrangler(createRunner(project.accountId), [
    'd1', 'export', 'VENDA_DB', '--remote', '--skip-confirmation', '--output', output
  ], { cwd: dir }), () => 'Database exported');
  p.note(`${output}\n\nThis SQL backup contains D1 content and metadata. R2 media files are stored separately.`, 'Backup created');
  p.outro('Done');
}
