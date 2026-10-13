// The content files in D1, and the one way they change. A write is one
// atomic batch: guards on each file's base SHA (and any the caller adds),
// the files, a revision for each, and the index rows derived from the files
// as they will be. A guard that fails aborts the whole batch, so a write
// either lands entirely or not at all.
import {
  Conflict,
  CONTENT_PATH,
  ContentTooLarge,
  InvalidContent,
  MAX_CONTENT_BYTES,
  type UserId
} from '@venda/contract';
import { gitBlobSha } from '@venda/content';
import { inArray, like } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';
import {
  AtomicWrites,
  Database,
  type AtomicWriteError,
  type SqlWrite
} from '../database';
import { reindex, type FileView } from './reindex';
import { contentFiles } from './schema';

const encoder = new TextEncoder();

/** A file to write (`text`), or to delete (`text: null`), from `baseSha` (null: it must not exist). */
export interface FileChange {
  readonly path: string;
  readonly text: string | null;
  readonly baseSha: string | null;
}

/** Who a write is credited to, in its revisions. */
export interface Author {
  readonly id: UserId | null;
  readonly name: string;
}

/** One of the caller's own guards failed: what it guarded changed meanwhile. */
export class GuardRefused extends Schema.TaggedError<GuardRefused>()(
  'GuardRefused',
  {}
) {}

interface WriteOptions {
  readonly author: Author;
  readonly message: string;
  /** `strict` refuses a changed file the index cannot read; `keep` stores it as a problem (imports). */
  readonly mode: 'strict' | 'keep';
  /** More conditions for the batch, built with `guard`. */
  readonly guards?: ReadonlyArray<SqlWrite>;
  /** More statements for the batch, after the files and index. */
  readonly extra?: ReadonlyArray<SqlWrite>;
}

/** A batch condition: the whole batch aborts unless `condition` holds. */
export const guard = (
  condition: string,
  params: ReadonlyArray<unknown>
): SqlWrite => ({
  sql: `INSERT INTO content_guard (ok) SELECT ${condition}`,
  params
});

const clearGuards: SqlWrite = { sql: 'DELETE FROM content_guard', params: [] };

const baseGuard = (change: FileChange) =>
  guard('(SELECT sha FROM content_files WHERE path = ?) IS ?', [
    change.path,
    change.baseSha
  ]);

/** D1 binds at most 100 parameters in one statement. */
const PATHS_PER_QUERY = 90;

/** The current SHA of each of `paths` that exists. */
export const currentShas = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const shas = new Map<string, string>();

    for (let at = 0; at < paths.length; at += PATHS_PER_QUERY) {
      const rows = yield* db
        .select({ path: contentFiles.path, sha: contentFiles.sha })
        .from(contentFiles)
        .where(
          inArray(contentFiles.path, paths.slice(at, at + PATHS_PER_QUERY))
        );

      for (const row of rows) shas.set(row.path, row.sha);
    }

    return shas;
  });

/** A file's text and SHA, if it exists. */
export const fileAt = (path: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ text: contentFiles.text, sha: contentFiles.sha })
      .from(contentFiles)
      .where(inArray(contentFiles.path, [path]));

    return Option.fromNullishOr(row);
  });

/** The files as they will be after `changes`: changes first, then the database. */
const viewWith = (changes: ReadonlyArray<FileChange>): FileView => {
  const changed = new Map(changes.map(change => [change.path, change.text]));

  return {
    read: path =>
      changed.has(path)
        ? Effect.succeed(changed.get(path) ?? undefined)
        : Effect.map(fileAt(path), found =>
            Option.getOrUndefined(Option.map(found, file => file.text))
          ),
    entriesOf: collection =>
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db
          .select({ path: contentFiles.path })
          .from(contentFiles)
          .where(like(contentFiles.path, `${collection}/%`));
        const paths = new Set(rows.map(row => row.path));

        for (const [path, text] of changed)
          if (path.startsWith(`${collection}/`))
            if (text === null) paths.delete(path);
            else paths.add(path);

        return [...paths].filter(path => !path.endsWith('/config.ts')).sort();
      })
  };
};

/** Checks each change before anything is written. */
const checked = (changes: ReadonlyArray<FileChange>) =>
  Effect.gen(function* () {
    const paths = new Set<string>();

    for (const change of changes) {
      if (!CONTENT_PATH.test(change.path))
        return yield* new InvalidContent({
          message: `${change.path} is not a content file: site.ts, <collection>/config.ts or <collection>/<slug>.md`
        });

      if (paths.has(change.path))
        return yield* new InvalidContent({
          message: `${change.path} is changed twice in one write`
        });

      if (
        change.text !== null &&
        encoder.encode(change.text).byteLength > MAX_CONTENT_BYTES
      )
        return yield* new ContentTooLarge();

      paths.add(change.path);
    }
  });

interface Prepared extends FileChange {
  readonly sha: string | null;
  readonly size: number;
}

const prepare = (change: FileChange) =>
  Effect.promise(async (): Promise<Prepared> => {
    if (change.text === null) return { ...change, sha: null, size: 0 };

    const bytes = encoder.encode(change.text);

    return { ...change, sha: await gitBlobSha(bytes), size: bytes.byteLength };
  });

/** The statements that store a file (or delete it) and record its revision. */
function fileStatements(
  file: Prepared,
  options: WriteOptions,
  at: string
): SqlWrite[] {
  const store: SqlWrite =
    file.text === null
      ? { sql: 'DELETE FROM content_files WHERE path = ?', params: [file.path] }
      : {
          sql: `INSERT INTO content_files (path, text, sha, size, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET text = excluded.text, sha = excluded.sha,
              size = excluded.size, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          params: [
            file.path,
            file.text,
            file.sha,
            file.size,
            at,
            options.author.id
          ]
        };

  return [
    store,
    {
      sql: `INSERT INTO content_revisions (path, sha, text, parent_sha, message, author_id, author_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        file.path,
        file.sha,
        file.text,
        file.baseSha,
        options.message,
        options.author.id,
        options.author.name,
        at
      ]
    }
  ];
}

/**
 * After a batch was refused: a file that moved is a conflict; otherwise one of
 * the caller's guards, if it had any; otherwise the database failed.
 */
const refusal = (
  files: ReadonlyArray<Prepared>,
  guarded: boolean,
  error: AtomicWriteError
) =>
  Effect.gen(function* () {
    const now = yield* currentShas(files.map(file => file.path));
    const moved = files.find(
      file => (now.get(file.path) ?? null) !== file.baseSha
    );

    if (moved)
      return yield* new Conflict({
        path: moved.path,
        sha: now.get(moved.path) ?? null
      });

    return guarded ? yield* new GuardRefused() : yield* error;
  });

/** Writes `changes` atomically; resolves to each file's new SHA (null when deleted). */
export const writeFiles = Effect.fnUntraced(function* (
  changes: ReadonlyArray<FileChange>,
  options: WriteOptions
) {
  yield* checked(changes);

  // A file that moved is reported before anything else about the write; the
  // batch's own guards still decide, should one move after this look.
  const now = yield* currentShas(changes.map(change => change.path));
  const moved = changes.find(
    change => (now.get(change.path) ?? null) !== change.baseSha
  );

  if (moved)
    return yield* new Conflict({
      path: moved.path,
      sha: now.get(moved.path) ?? null
    });

  const files = yield* Effect.forEach(changes, prepare);
  const index = yield* reindex(
    viewWith(changes),
    changes.map(change => change.path)
  );
  const unreadable = files.find(
    file => file.text !== null && index.problems.has(file.path)
  );

  if (options.mode === 'strict' && unreadable)
    return yield* new InvalidContent({
      message: `${unreadable.path}: ${index.problems.get(unreadable.path) ?? ''}`
    });

  const at = DateTime.formatIso(yield* DateTime.now);
  const atomic = yield* AtomicWrites;

  yield* atomic
    .run([
      ...files.map(baseGuard),
      ...(options.guards ?? []),
      ...files.flatMap(file => fileStatements(file, options, at)),
      ...index.writes,
      ...(options.extra ?? []),
      clearGuards
    ])
    .pipe(
      Effect.catchTag('AtomicWriteError', error =>
        refusal(files, (options.guards ?? []).length > 0, error)
      )
    );

  return files.map(file => ({ path: file.path, sha: file.sha }));
});
