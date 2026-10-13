// Every index is built from reads made after this revision number. Guarding
// it also catches collection membership changes and newly claimed slugs.
import { desc } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { Database, type SqlWrite } from '../database';
import { contentRevisions } from './schema';

export class IndexChanged extends Schema.TaggedError<IndexChanged>()(
  'IndexChanged',
  { path: Schema.String, sha: Schema.NullOr(Schema.String) }
) {}

export const indexVersion = Effect.gen(function* () {
  const db = yield* Database;
  const [row] = yield* db
    .select({
      id: contentRevisions.id,
      path: contentRevisions.path,
      sha: contentRevisions.sha
    })
    .from(contentRevisions)
    .orderBy(desc(contentRevisions.id))
    .limit(1);

  return row;
});

export const versionGuard = (id: number): SqlWrite => ({
  sql: 'INSERT INTO content_guard (ok) SELECT COALESCE((SELECT MAX(id) FROM content_revisions), 0) = ?',
  params: [id]
});

export const checkVersion = (id: number) =>
  Effect.gen(function* () {
    const now = yield* indexVersion;

    if (now && now.id !== id)
      return yield* new IndexChanged({ path: now.path, sha: now.sha });
  });
