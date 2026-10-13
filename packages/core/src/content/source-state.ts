// Where the index stands against its content source, and the rules that let
// several isolates, webhooks and publishes act at once without an older state
// replacing a newer one (docs/plans/slice-4-github-store.md, Concurrency).
//
// - A sync pass holds the lease it claimed; every claim raises the fence.
// - Each file a pass writes is one batch that opens with a guard: the batch
//   aborts unless the pass still holds its fence and no newer generation (a
//   publish since the pass began) wrote that file.
// - Requests count up; a complete pass answers the ones before it began.
import { eq, lt, isNull, or, sql } from 'drizzle-orm';
import { Effect, Option } from 'effect';
import { Database, type SqlWrite } from '../database';
import { contentSource } from './schema';

const ROW = 1;

/** How long a pass may hold the lease before another may take over. */
export const LEASE_MS = 30_000;

/** What a pass claimed: its fence, and the generation and requests it began at. */
export interface SyncPass {
  readonly fence: number;
  readonly generation: number;
  readonly requested: number;
}

const ensureRow = Effect.flatMap(Database, db =>
  db.insert(contentSource).values({ id: ROW }).onConflictDoNothing()
);

/** Asks for a sync pass: a webhook, the scheduled check, or an outside edit. */
export const requestSync = Effect.andThen(
  ensureRow,
  Effect.flatMap(Database, db =>
    db
      .update(contentSource)
      .set({ requested: sql`${contentSource.requested} + 1` })
      .where(eq(contentSource.id, ROW))
  )
);

/** Claims the lease if nobody holds it, or its holder ran out of time. */
export const claimPass = (now: number) =>
  Effect.gen(function* () {
    yield* ensureRow;

    const db = yield* Database;
    const [claimed] = yield* db
      .update(contentSource)
      .set({
        fence: sql`${contentSource.fence} + 1`,
        leaseUntil: now + LEASE_MS
      })
      .where(
        sql`${contentSource.id} = ${ROW} AND (${or(
          isNull(contentSource.leaseUntil),
          lt(contentSource.leaseUntil, now)
        )})`
      )
      .returning({
        fence: contentSource.fence,
        generation: contentSource.generation,
        requested: contentSource.requested
      });

    return Option.fromNullishOr(claimed);
  });

/**
 * A file's statements as one batch the pass may still write: it aborts, as a
 * whole, when the fence moved on or a newer generation wrote the file.
 */
export const guarded = (
  pass: SyncPass,
  path: string,
  statements: ReadonlyArray<SqlWrite>
): SqlWrite[] => [
  {
    sql: `INSERT INTO content_guard (ok) SELECT
      (SELECT count(*) FROM content_source WHERE id = ? AND fence = ?) = 1
      AND NOT EXISTS (SELECT 1 FROM content_files WHERE path = ? AND generation > ?)`,
    params: [ROW, pass.fence, path, pass.generation]
  },
  ...statements,
  { sql: 'DELETE FROM content_guard', params: [] }
];

/**
 * Ends a pass that read everything it meant to. When nothing remains, the
 * index is at `version` and the requests before the pass are answered.
 */
export const finishPass = (
  pass: SyncPass,
  version: string,
  remaining: number,
  at: string
) =>
  Effect.flatMap(Database, db => {
    const ended = {
      leaseUntil: null,
      remaining,
      syncedAt: at,
      lastError: null
    };
    const complete = {
      ...ended,
      indexedVersion: version,
      handled: pass.requested
    };

    return db
      .update(contentSource)
      .set(remaining === 0 ? complete : ended)
      .where(
        sql`${contentSource.id} = ${ROW} AND ${contentSource.fence} = ${pass.fence}`
      );
  });

/**
 * Ends a pass early: its batch was refused (a newer fence or generation), or
 * the source failed. It asks for another pass, and keeps the reason.
 */
export const abandonPass = (pass: SyncPass, reason: string | null) =>
  Effect.flatMap(Database, db =>
    db
      .update(contentSource)
      .set({
        leaseUntil: null,
        requested: sql`${contentSource.requested} + 1`,
        lastError: reason
      })
      .where(
        sql`${contentSource.id} = ${ROW} AND ${contentSource.fence} = ${pass.fence}`
      )
  );

/** Where the index stands: what a status screen and the scheduler read. */
export const sourceState = Effect.gen(function* () {
  yield* ensureRow;

  const db = yield* Database;
  const [row] = yield* db
    .select()
    .from(contentSource)
    .where(eq(contentSource.id, ROW));

  return Option.fromNullishOr(row);
});

/**
 * Statements a publish or a settings save adds to its own atomic batch: the
 * source moves on a generation, and the file it wrote carries it, so a sync
 * pass that began before it never writes over it. `when` limits them to a
 * batch whose own guard holds (a publish intent still pending).
 */
export const stampWrite = (
  path: string,
  sha: string,
  when: SqlWrite = { sql: '1', params: [] }
): SqlWrite[] => [
  {
    sql: `INSERT INTO content_source (id) VALUES (?) ON CONFLICT(id) DO NOTHING`,
    params: [ROW]
  },
  {
    sql: `UPDATE content_source SET generation = generation + 1 WHERE id = ? AND (${when.sql})`,
    params: [ROW, ...when.params]
  },
  {
    sql: `INSERT INTO content_files (path, sha, generation)
      SELECT ?, ?, generation FROM content_source WHERE id = ? AND (${when.sql})
      ON CONFLICT(path) DO UPDATE SET sha = excluded.sha, generation = excluded.generation`,
    params: [path, sha, ROW, ...when.params]
  }
];
