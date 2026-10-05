// Reads and writes of the content index tables (migrations/0004_content_index.sql).
import { modelFrom, type CollectionModel, type Entry } from '@venda/content';
import { DateTime, Effect, Option, Result, Schema } from 'effect';
import { IndexDb, IndexDbError } from './services';

const decodeRows = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(Schema.Array(schema));

  return (rows: ReadonlyArray<unknown>) => decode(rows).pipe(Effect.mapError(error => new IndexDbError({ message: `Unexpected index row: ${error.message}` })));
};

const select = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, sql: string, params: ReadonlyArray<string | number | null> = []) => Effect.gen(function*() {
  const db = yield* IndexDb;

  return yield* decodeRows(schema)(yield* db.all(sql, params));
});

const run = (sql: string, params: ReadonlyArray<string | number | null> = []) => Effect.flatMap(IndexDb, db => db.run(sql, params));

const now = Effect.map(DateTime.now, DateTime.formatIso);

/** The SHA the index last saw for each path. */
export const knownFiles = Effect.map(
  select(Schema.Struct({ path: Schema.String, sha: Schema.String }), 'SELECT path, sha FROM content_files'),
  rows => new Map(rows.map(row => [row.path, row.sha]))
);

export const markFile = (path: string, sha: string) => run('INSERT INTO content_files (path, sha) VALUES (?, ?) ON CONFLICT (path) DO UPDATE SET sha = excluded.sha', [path, sha]);

export const forgetFile = (path: string) => run('DELETE FROM content_files WHERE path = ?', [path]);

export const recordProblem = (path: string, message: string, line: number | undefined) => Effect.flatMap(now, at => run(
  'INSERT INTO content_problems (path, message, line, recorded_at) VALUES (?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET message = excluded.message, line = excluded.line, recorded_at = excluded.recorded_at',
  [path, message, line ?? null, at]
));

export const clearProblem = (path: string) => run('DELETE FROM content_problems WHERE path = ?', [path]);

const ModelRow = Schema.Struct({ model_json: Schema.fromJsonString(Schema.Json) });

/** A collection's model as last indexed, if its config was valid. */
export const modelOf = (collection: string) => Effect.map(
  select(ModelRow, 'SELECT model_json FROM content_collections WHERE slug = ?', [collection]),
  ([row]) => Option.flatMap(Option.fromNullishOr(row), ({ model_json }) => Result.getSuccess(modelFrom(model_json)))
);

export const saveCollection = (slug: string, path: string, model: CollectionModel) => Effect.flatMap(now, at => run(
  'INSERT INTO content_collections (slug, path, model_json, indexed_at) VALUES (?, ?, ?, ?) ON CONFLICT (slug) DO UPDATE SET path = excluded.path, model_json = excluded.model_json, indexed_at = excluded.indexed_at',
  [slug, path, JSON.stringify(model), at]
));

/** Drops a collection and its entries, and forgets its entry files so they are read again against a new model. */
export const dropCollection = (slug: string, configPath: string) => Effect.all([
  run('DELETE FROM content_collections WHERE slug = ?', [slug]),
  run('DELETE FROM content_entries WHERE collection = ?', [slug]),
  run('DELETE FROM content_files WHERE path LIKE ? AND path <> ?', [`${slug}/%`, configPath])
], { discard: true });

/** Forgets the entry files of a collection, so the next sync reads them against its new model. */
export const staleEntries = (slug: string, configPath: string) => run('DELETE FROM content_files WHERE path LIKE ? AND path <> ?', [`${slug}/%`, configPath]);

export const dropEntry = (path: string) => run('DELETE FROM content_entries WHERE path = ?', [path]);

/** The other file already using an entry's slug, if any (`a.md` and `a.mdx`). */
export const slugOwner = (collection: string, slug: string, path: string) => Effect.map(
  select(Schema.Struct({ path: Schema.String }), 'SELECT path FROM content_entries WHERE collection = ? AND slug = ? AND path <> ?', [collection, slug, path]),
  ([row]) => Option.map(Option.fromNullishOr(row), each => each.path)
);

/** `publishedAt` in UTC, so the index can compare it as text. */
const utc = (value: string | undefined) => Option.getOrNull(Option.map(Option.flatMap(Option.fromNullishOr(value), text => DateTime.make(text)), DateTime.formatIso));

export const saveEntry = (path: string, sha: string, entry: Entry) => Effect.flatMap(now, at => run(
  `INSERT INTO content_entries (collection, slug, path, draft, published_at, data_json, sha, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (path) DO UPDATE SET slug = excluded.slug, draft = excluded.draft, published_at = excluded.published_at, data_json = excluded.data_json, sha = excluded.sha, updated_at = excluded.updated_at`,
  [entry.collection, entry.slug, path, entry.draft ? 1 : 0, utc(entry.publishedAt), JSON.stringify(entry.data), sha, at, at]
));

export { select };
