// Working on a folder of the site's content: pull it, see what changed, push
// it back, and settle a conflict.
import { MAX_FILES_PER_WRITE } from '@venda/contract';
import { request, siteFile } from '../client';
import { inBatches, plural, report, short, type Context } from '../context';
import { CliFailure } from '../failure';
import {
  readFolder,
  readManifest,
  removeFrom,
  shasOf,
  writeInto,
  writeManifest
} from '../folder';
import { pendingChanges, planPull } from '../plan';

const merging =
  'Merge each (`venda show <path>` prints the site’s), then `venda resolve <path>` and push.';

export async function pull(context: Context, dir: string, discard: boolean) {
  const local = await shasOf(await readFolder(dir));
  const manifest = await readManifest(dir, context.site);
  const listed = await request(context.api.files.list());
  const plan = planPull(
    local,
    manifest,
    new Map(listed.map(file => [file.path, file.sha])),
    discard
  );

  // A file's SHA is taken from its read, so a change made since the listing
  // is recorded with the text that has it.
  await inBatches(plan.fetch, async path => {
    const file = await siteFile(context.api, path);

    if (file === null) {
      plan.manifest.delete(path);
      await removeFrom(dir, path);
    } else {
      plan.manifest.set(path, file.sha);
      await writeInto(dir, path, file.text);
    }
  });

  for (const path of plan.remove) await removeFrom(dir, path);

  await writeManifest(dir, context.site, plan.manifest);

  return report(
    [
      `Pulled ${plural(plan.fetch.length, 'file')} into ${dir}, removed ${plan.remove.length}`,
      ...plan.conflicts.map(
        path => `  changed here and on the site, kept as yours: ${path}`
      ),
      ...(plan.conflicts.length ? [merging] : [])
    ].join('\n'),
    { fetched: plan.fetch, removed: plan.remove, conflicts: plan.conflicts }
  );
}

/** What changed in the folder since it was pulled. */
async function pendingIn(context: Context, dir: string) {
  const files = await readFolder(dir);
  const manifest = await readManifest(dir, context.site);

  return {
    files,
    manifest,
    pending: pendingChanges(await shasOf(files), manifest)
  };
}

export async function status(context: Context, dir: string) {
  const { pending } = await pendingIn(context, dir);

  return report(
    pending.length
      ? pending.map(each => `${each.kind.padEnd(8)}${each.path}`).join('\n')
      : 'Nothing changed since the last pull',
    { pending: pending.map(({ path, kind }) => ({ path, kind })) }
  );
}

export async function push(context: Context, dir: string, message: string) {
  const { files, manifest, pending } = await pendingIn(context, dir);

  if (pending.length === 0)
    return report('Nothing to push: the folder matches what was pulled', {
      written: []
    });

  if (pending.length > MAX_FILES_PER_WRITE)
    throw new CliFailure(
      'TooManyFiles',
      `${pending.length} files changed, and a push takes at most ${MAX_FILES_PER_WRITE}: push them in parts`
    );

  const written = await request(
    context.api.files.write({
      payload: {
        message,
        changes: pending.map(each => ({
          path: each.path,
          text: each.kind === 'deleted' ? null : (files.get(each.path) ?? null),
          baseSha: each.baseSha
        }))
      }
    })
  );

  for (const file of written.files)
    if (file.sha === null) manifest.delete(file.path);
    else manifest.set(file.path, file.sha);

  await writeManifest(dir, context.site, manifest);

  return report(
    [
      `Published ${plural(pending.length, 'file')}`,
      ...pending.map(each => `  ${each.kind.padEnd(8)}${each.path}`)
    ].join('\n'),
    { written: pending.map(({ path, kind }) => ({ path, kind })) }
  );
}

/**
 * Takes the site's version of a file (at `sha`, or as it is now) as the one
 * the folder's version replaces: after merging a conflict by hand.
 */
export async function resolve(
  context: Context,
  dir: string,
  path: string,
  sha: string | undefined
) {
  const manifest = await readManifest(dir, context.site);
  const base =
    sha === undefined
      ? ((await siteFile(context.api, path))?.sha ?? null)
      : sha;

  if (base === null) manifest.delete(path);
  else manifest.set(path, base);

  await writeManifest(dir, context.site, manifest);

  return report(
    `${path} now replaces the site’s ${short(base)}: push to publish yours`,
    { path, baseSha: base }
  );
}
