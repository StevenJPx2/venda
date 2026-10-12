import { AtomicWrites, AtomicWriteError } from '@venda/core/database';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/sql';
import type { DatabaseDriver } from './target';

export const atomicWritesLayer = (driver: DatabaseDriver) =>
  Layer.effect(
    AtomicWrites,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const context = yield* Effect.context<SqlClient.SqlClient>();

      return {
        run: statements =>
          driver
            .atomically(
              statements.map(statement =>
                sql.unsafe(statement.sql, statement.params)
              )
            )
            .pipe(
              Effect.provideContext(context),
              Effect.mapError(cause => new AtomicWriteError({ cause }))
            )
      };
    })
  );
