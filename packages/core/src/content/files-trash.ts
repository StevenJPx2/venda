// Ordinary writes cannot revive a trashed entry, including through the other
// Markdown extension. Only the restore operation supplies a matching revision.
import { EntryTrashed } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database, type SqlWrite } from '../database';
import type { FileChange } from './files';
import { contentWork } from './schema';

export interface Revival {
  readonly path: string;
  readonly revision: number;
}

const refAt = (path: string) => {
  const match = /^([^/]+)\/([^/]+)\.mdx?$/.exec(path);

  return match?.[1] && match[2]
    ? { collection: match[1], slug: match[2] }
    : undefined;
};

export const assertActiveFiles = (
  files: ReadonlyArray<FileChange>,
  revival: Revival | undefined
) =>
  Effect.gen(function* () {
    const db = yield* Database;

    for (const file of files) {
      const ref = refAt(file.path);

      if (!ref || revival?.path === file.path) continue;

      const [row] = yield* db
        .select({ slug: contentWork.slug })
        .from(contentWork)
        .where(
          and(
            eq(contentWork.collection, ref.collection),
            eq(contentWork.slug, ref.slug),
            eq(contentWork.status, 'trashed')
          )
        );

      if (row) return yield* new EntryTrashed(ref);
    }
  });

/** A trash decision made after the pre-check still aborts the batch. */
export function trashGuards(
  files: ReadonlyArray<FileChange>,
  revival: Revival | undefined
): SqlWrite[] {
  return files.flatMap(file => {
    const ref = refAt(file.path);

    if (!ref) return [];

    const active = `NOT EXISTS (SELECT 1 FROM content_work
      WHERE collection = ? AND slug = ? AND status = 'trashed')`;

    return [
      {
        sql: `INSERT INTO content_guard (ok) SELECT ${active}${
          revival?.path === file.path
            ? " OR EXISTS (SELECT 1 FROM content_work WHERE path = ? AND revision = ? AND status = 'trashed')"
            : ''
        }`,
        params:
          revival?.path === file.path
            ? [ref.collection, ref.slug, revival.path, revival.revision]
            : [ref.collection, ref.slug]
      }
    ];
  });
}
