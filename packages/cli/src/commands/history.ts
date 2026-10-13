// A file's versions on the site: list them, print one, and restore one (a new
// write of the old text, refused like any other if the file moves meanwhile).
import { request, siteFile } from '../client';
import { plural, report, short, type Context } from '../context';
import { CliFailure } from '../failure';

const FULL_SHA = /^[0-9a-f]{40}$/;

const revisionsOf = (context: Context, path: string) =>
  request(context.api.files.revisions({ query: { path } }));

export async function history(context: Context, path: string) {
  const versions = await revisionsOf(context, path);
  const lines = versions.map(
    each =>
      `${short(each.sha)}  ${each.createdAt.slice(0, 16).replace('T', ' ')}  ${each.authorName}  ${each.message}`
  );

  return report(
    lines.length ? lines.join('\n') : `${path} has no history on the site`,
    {
      path,
      revisions: versions.map(each => ({
        sha: each.sha,
        parentSha: each.parentSha,
        message: each.message,
        author: each.authorName,
        createdAt: each.createdAt
      }))
    }
  );
}

/** The one version of `path` that `prefix` names, among its last hundred. */
async function versionOf(context: Context, path: string, prefix: string) {
  if (FULL_SHA.test(prefix)) return prefix;

  const matches = new Set(
    (await revisionsOf(context, path)).flatMap(each =>
      each.sha?.startsWith(prefix) ? [each.sha] : []
    )
  );
  const [only] = matches;

  if (matches.size !== 1 || only === undefined)
    throw new CliFailure(
      'UnknownVersion',
      matches.size
        ? `${prefix} names ${plural(matches.size, 'version')} of ${path}: give more of it`
        : `${path} has no version ${prefix} in its last 100 (see \`venda history ${path}\`)`,
      path
    );

  return only;
}

/** A file's text on the site now, or at a version. */
export async function show(
  context: Context,
  path: string,
  at: string | undefined
) {
  const file =
    at === undefined
      ? await siteFile(context.api, path)
      : await request(
          context.api.files.revision({
            query: { path, sha: await versionOf(context, path, at) }
          })
        );

  if (file === null)
    throw new CliFailure(
      'FileNotFound',
      `${path} does not exist on the site`,
      path
    );

  return report(file.text, { path, sha: file.sha, text: file.text });
}

export async function restore(context: Context, path: string, to: string) {
  const sha = await versionOf(context, path, to);
  const old = await request(
    context.api.files.revision({ query: { path, sha } })
  );
  const now = await siteFile(context.api, path);

  if (now?.sha === sha)
    return report(`${path} is already at ${short(sha)}`, { path, sha });

  await request(
    context.api.files.write({
      payload: {
        message: `Restore ${path} to ${short(sha)}`,
        changes: [{ path, text: old.text, baseSha: now?.sha ?? null }]
      }
    })
  );

  return report(
    `Restored ${path} to ${short(sha)}. \`venda pull\` brings it into your folder.`,
    { path, sha }
  );
}
