// What the app needs from where it runs: the SQL client behind the database.
// Cloudflare Workers in production and in local development
// (src/cloudflare.ts); an in-memory SQLite target in tests.
import type { Database } from '@venda/core/database';
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

export interface Target {
  readonly database: DatabaseDriver;
}
