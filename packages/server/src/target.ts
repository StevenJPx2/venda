// What the app needs from where it runs: the SQL client behind the database,
// and where content files come from. Cloudflare Workers in production and in
// local development (src/cloudflare.ts); an in-memory SQLite target in tests.
import type { Database } from '@venda/core/database';
import type { ContentFileStore } from '@venda/core/content';
import type { Delivery } from './github/webhook';
import type { Config, Effect, Layer, Schema } from 'effect';
import type { SqlClient, SqlError, Statement } from 'effect/sql';

export interface DatabaseDriver {
  /** The SQL client and the Drizzle index over it; fails when the database cannot be opened or its binding is missing. */
  readonly layer: Layer.Layer<
    SqlClient.SqlClient | Database,
    SqlError.SqlError | Config.ConfigError | Schema.SchemaError
  >;
  /** Runs statements all or nothing: a batch on D1 (which has no transactions), a transaction on SQLite. */
  readonly atomically: (
    statements: ReadonlyArray<Statement.Statement<object>>
  ) => Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>;
}

/** A file's raw value: text from bundled assets, bytes from the local content server. */
export type RawFile = Uint8Array | ArrayBuffer | string | null;

/** The parts of a Nitro storage mount the content store reads. */
export interface ContentFiles {
  getKeys(): Promise<string[]>;
  getItemRaw(key: string): Promise<RawFile>;
}

/**
 * A folder on this machine: before each request the app asks whether it
 * changed, and re-indexes first if it did.
 */
export interface WatchedUpdates {
  readonly kind: 'watched';
  /** Resolves true when the files changed since the last call. */
  readonly changed: () => Promise<boolean>;
  /** Forces a fresh comparison after a mutation, including an uncertain write. */
  readonly invalidate: () => void;
}

/** Content built into the Worker: it changes only with a deploy. */
export interface BuiltUpdates {
  readonly kind: 'built';
}

/**
 * A repository others push to: webhook deliveries and the scheduled check ask
 * for a sync, which runs in the background.
 */
export interface PushedUpdates {
  readonly kind: 'pushed';
  /** The branch's current commit, for the scheduled check. */
  readonly head: () => Promise<string>;
  /** Reads and verifies a webhook delivery. */
  readonly delivery: (request: Request) => Promise<Delivery>;
}

export interface ContentSource {
  readonly store: ContentFileStore;
  readonly updates: WatchedUpdates | BuiltUpdates | PushedUpdates;
}

export interface Target {
  readonly database: DatabaseDriver;
  /** The content built into the app; `VENDA_CONTENT_URL` replaces it in local development. */
  readonly content: () => ContentSource;
  /** Keeps work running after the response (Workers' `waitUntil`). */
  readonly background: (work: Promise<unknown>) => void;
}
