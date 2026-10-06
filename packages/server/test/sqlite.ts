// node:sqlite through Drizzle, with real transactions: the database behind the
// server's tests, opened in memory.
import type { SqliteClient } from '@effect/sql-sqlite-node';
import { Database } from '@venda/core/database';
import * as SqliteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/sql';
import type { DatabaseDriver } from '../src/target';

export const sqliteDatabase = (
  client: ReturnType<typeof SqliteClient.layer>
): DatabaseDriver => ({
  layer: Layer.provideMerge(
    Layer.effect(Database, SqliteDrizzle.makeWithDefaults({})),
    client
  ),
  atomically: statements =>
    Effect.flatMap(SqlClient.SqlClient, sql =>
      sql.withTransaction(
        Effect.forEach(statements, each => each, { discard: true })
      )
    )
});
