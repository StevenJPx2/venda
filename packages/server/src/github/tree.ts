// What Venda reads from a Git tree, and what a conditional write should do.
// Pure, so the rules are tested without GitHub.
import type { StoredFile } from '@venda/core/content';
import { Schema } from 'effect';

// The files sync reads; images and other files beside them are skipped.
const CONTENT_FILE = /^site\.ts$|^[^/]+\/(?:config\.ts|[^/]+\.mdx?)$/;

// A regular or executable file; symlinks (120000) and submodules are not content.
const FILE_MODES = new Set(['100644', '100755']);

const TreeEntry = Schema.Struct({
  path: Schema.String,
  mode: Schema.String,
  type: Schema.String,
  sha: Schema.String,
  size: Schema.optional(Schema.Number)
});

export type TreeEntry = typeof TreeEntry.Type;

export const Tree = Schema.Struct({
  tree: Schema.Array(TreeEntry),
  truncated: Schema.Boolean
});

/** `dir` plus a slash, or nothing for the repository root. */
export const prefixOf = (dir: string) => (dir ? `${dir}/` : '');

/** A file of the content folder, by its path relative to that folder. */
export function contentFiles(
  entries: ReadonlyArray<TreeEntry>,
  dir: string
): StoredFile[] {
  const prefix = prefixOf(dir);

  return entries.flatMap(entry => {
    const path = entry.path.slice(prefix.length);
    const wanted =
      entry.type === 'blob' &&
      FILE_MODES.has(entry.mode) &&
      entry.path.startsWith(prefix) &&
      CONTENT_FILE.test(path);

    return wanted
      ? [
          entry.size === undefined
            ? { path, sha: entry.sha }
            : { path, sha: entry.sha, size: entry.size }
        ]
      : [];
  });
}

/** Whether a walk of a truncated tree must look inside `path` to reach the content. */
export const leadsTo = (path: string, dir: string) =>
  dir === '' ||
  path === dir ||
  dir.startsWith(`${path}/`) ||
  path.startsWith(`${dir}/`);

export type WriteDecision = 'done' | 'write' | 'conflict';

/**
 * Compares the file as it is now with what a publish expects: its own bytes
 * already there (a retry after a lost answer), the base it was edited from,
 * or somebody else's change.
 */
export function writeDecision(
  current: string | null,
  baseSha: string | null,
  sha: string
): WriteDecision {
  if (current === sha) return 'done';

  return current === baseSha ? 'write' : 'conflict';
}
