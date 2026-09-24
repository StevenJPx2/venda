import { resolve } from 'node:path';
import { loadProject } from '../project.js';
import { UsageError, answer, p, step } from '../ui.js';
import { createRunner, wrangler } from '../wrangler.js';
import type { Flags } from '../flags.js';

async function confirmRemoval(name: string, keepData: boolean, flags: Flags): Promise<void> {
  if (flags.yes) return;
  if (flags.noPrompt) throw new UsageError('Uninstall requires confirmation. Pass --yes to confirm.');
  p.log.warn(keepData
    ? 'This removes the deployed Worker and leaves D1, KV, and R2 data in your Cloudflare account.'
    : 'This permanently deletes the Worker, D1 database, KV namespace, and R2 bucket.');
  const typed = answer(await p.text({ message: `Type "${name}" to confirm` }));
  if (typed.trim() !== name) throw new UsageError('The install name did not match. Uninstall cancelled.');
}

export async function uninstall(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  if (!project.resources) throw new UsageError('This install has no recorded resources.');
  await confirmRemoval(project.name, flags.keepData, flags);

  p.intro(`Venda · uninstall ${project.name}`);
  const runner = createRunner(project.accountId);

  if (!flags.keepData) {
    // Delete R2 first: Wrangler refuses to remove a non-empty bucket. If it
    // contains files, this fails before the database or KV data is removed.
    try {
      await step(`Deleting R2 bucket ${project.resources.r2.name}`, () => wrangler(runner, [
        'r2', 'bucket', 'delete', project.resources!.r2.name
      ], { cwd: dir }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not delete R2 bucket ${project.resources.r2.name}; it may still contain media. Empty the bucket in Cloudflare and retry. No D1 or KV data has been deleted.\n${detail}`);
    }
    await step(`Deleting D1 database ${project.resources.d1.name}`, () => wrangler(runner, [
      'd1', 'delete', project.resources!.d1.name, '--skip-confirmation'
    ], { cwd: dir }));
    await step(`Deleting KV namespace ${project.resources.kv.title}`, () => wrangler(runner, [
      'kv', 'namespace', 'delete', '--namespace-id', project.resources!.kv.id, '--skip-confirmation'
    ], { cwd: dir }));
  }

  if (project.version || project.url) {
    await step(`Deleting Worker ${project.name}`, () => wrangler(runner, ['delete', project.name, '--force'], { cwd: dir }));
  } else {
    p.log.info('No deployed Worker is recorded; removed the provisioned resources.');
  }
  p.note(flags.keepData
    ? 'The Worker was deleted. Your D1, KV and R2 resources are preserved; venda.json remains so you can re-deploy.'
    : 'The Worker and Cloudflare resources were deleted. Local venda.json and release files remain.', 'Uninstalled');
  p.outro('Done');
}
