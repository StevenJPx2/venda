// What the content domain needs from its host: the files, and the SQL index.
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors';
import type { QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import type { SQLiteEffectDatabase } from 'drizzle-orm/sqlite-core/effect';
import { Context, type Effect, Schema } from 'effect';

/** A file in the content store and its git blob SHA. */
export interface StoredFile {
  readonly path: string;
  readonly sha: string;
}

export class ContentStoreError extends Schema.TaggedError<ContentStoreError>()('ContentStoreError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/** The content files: `<collection>/config.ts` and `<collection>/<slug>.md`. */
export class ContentStore extends Context.Service<ContentStore, {
  /** Every file, with its SHA. */
  readonly list: Effect.Effect<ReadonlyArray<StoredFile>, ContentStoreError>;
  readonly read: (path: string) => Effect.Effect<string, ContentStoreError>;
}>()('venda/core/content/ContentStore') {}

// What every Drizzle Effect SQLite driver (D1, node:sqlite, libSQL, Durable Objects) shares.
interface IndexQueries extends QueryEffectHKTBase {
  readonly error: EffectDrizzleQueryError;
  readonly context: never;
}

export type IndexDatabase = SQLiteEffectDatabase<IndexQueries, unknown>;

/** The index, as a Drizzle database over whichever SQLite the host provides. */
export class IndexDb extends Context.Service<IndexDb, IndexDatabase>()('venda/core/content/IndexDb') {}

const encoder = new TextEncoder();

/** The SHA git gives a file's content, so local SHAs match GitHub's. */
export async function gitBlobSha(content: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${content.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + content.byteLength);

  blob.set(header);
  blob.set(content, header.byteLength);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', blob));

  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
