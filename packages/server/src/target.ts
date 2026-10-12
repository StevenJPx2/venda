// What the app needs from where it runs: the SQL client behind the database,
// and where content files come from. Cloudflare Workers in production and in
// local development (src/cloudflare.ts); an in-memory SQLite target in tests.
import type { Database } from '@venda/core/database';
import type { ContentCommit } from '@venda/core/content';
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

export interface ContentSource {
  readonly files: ContentFiles;
  readonly commit?: (input: ContentCommit) => Promise<{ readonly sha: string }>;
  /**
   * Where files can change while the app runs: resolves true when they have
   * changed since the last call, so the app re-indexes before answering.
   */
  readonly changed: (() => Promise<boolean>) | undefined;
}

export interface Target {
  readonly database: DatabaseDriver;
  /** The content built into the app; `VENDA_CONTENT_URL` replaces it in local development. */
  readonly content: () => ContentSource;
}
