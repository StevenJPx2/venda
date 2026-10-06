// What differs per Nitro preset, chosen through the `#venda/target` alias
// (nitro.config.ts): the SQL client behind the database, and where content
// files come from. Everything else is the same code on every runtime.
import type { Database } from '@venda/core/database';
import type { Config, Effect, Layer, Schema } from 'effect';
import type { SqlClient, SqlError, Statement } from 'effect/sql';

export interface DatabaseDriver {
  /** The SQL client and the Drizzle index over it; fails when the database cannot be opened or its binding is missing. */
  readonly layer: Layer.Layer<
    SqlClient.SqlClient | Database,
    SqlError.SqlError | Config.ConfigError | Schema.SchemaError
  >;
  /** Runs statements all or nothing: a transaction on SQLite, a batch on D1 (which has no transactions). */
  readonly atomically: (
    statements: ReadonlyArray<Statement.Statement<object>>
  ) => Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>;
}

/** A file's raw value: bytes from the filesystem driver, possibly text from bundled assets. */
export type RawFile = Uint8Array | ArrayBuffer | string | null;

/** The parts of a Nitro storage mount the content store reads. */
export interface ContentFiles {
  getKeys(): Promise<string[]>;
  getItemRaw(key: string): Promise<RawFile>;
}

export interface ContentSource {
  readonly files: ContentFiles;
  /** Calls `onChange` after files change, where the files can change while running; resolves to a function that stops watching. */
  readonly watch:
    ((onChange: () => void) => Promise<() => Promise<void>>) | undefined;
}

export interface Target {
  readonly database: DatabaseDriver;
  readonly content: () => ContentSource;
}
