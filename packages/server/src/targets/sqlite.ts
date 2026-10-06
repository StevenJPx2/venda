// node:sqlite through Drizzle, with real transactions. The Node target opens it
// in `.data/`; the server's tests open the same driver in memory.
import type { SqliteClient } from '@effect/sql-sqlite-node';
import { Database } from '@venda/core/database';
import * as SqliteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/sql';
import type { DatabaseDriver } from '../target';

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
