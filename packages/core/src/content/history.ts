// A content file's history: every version written, newest first, and the text
// of any one of them, for `venda history` and `venda restore`.
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { Effect } from 'effect';
import type { CanEditFiles } from '../auth/proofs/can-edit-files';
import { Database } from '../database';
import { contentRevisions } from './schema';

/** At most this many revisions in one page of a file's history. */
const HISTORY_PAGE = 100;

/** A file's revisions newest first, before revision `before` when given; no texts. */
export const listRevisions = <A>(
  path: string,
  before: number | undefined,
  _proof: CanEditFiles<A>
) =>
  Effect.flatMap(Database, db =>
    db
      .select({
        id: contentRevisions.id,
        sha: contentRevisions.sha,
        parentSha: contentRevisions.parentSha,
        message: contentRevisions.message,
        authorName: contentRevisions.authorName,
        createdAt: contentRevisions.createdAt
      })
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.path, path),
          before === undefined ? undefined : lt(contentRevisions.id, before)
        )
      )
      .orderBy(desc(contentRevisions.id))
      .limit(HISTORY_PAGE)
  );

/** The text a file had at `sha`, or null when it never had that version. */
export const revisionText = <A>(
  path: string,
  sha: string,
  _proof: CanEditFiles<A>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ text: contentRevisions.text })
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.path, path),
          eq(contentRevisions.sha, sha),
          isNotNull(contentRevisions.text)
        )
      )
      .orderBy(desc(contentRevisions.id))
      .limit(1);

    return row?.text ?? null;
  });
