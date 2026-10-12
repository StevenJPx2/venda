// The core's SQL database: the content index and the operational state
// (accounts), as one Drizzle SQLite database over whatever the host provides.
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors';
import type { QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import type { SQLiteEffectDatabase } from 'drizzle-orm/sqlite-core/effect';
import { Context, type Effect, Schema } from 'effect';

// What every Drizzle Effect SQLite driver (D1, node:sqlite, libSQL, Durable Objects) shares.
interface Queries extends QueryEffectHKTBase {
  readonly error: EffectDrizzleQueryError;
  readonly context: never;
}

export type DrizzleDatabase = SQLiteEffectDatabase<Queries, unknown>;

export class Database extends Context.Service<Database, DrizzleDatabase>()(
  'venda/core/Database'
) {}

export interface SqlWrite {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
}

export class AtomicWriteError extends Schema.TaggedError<AtomicWriteError>()(
  'AtomicWriteError',
  { cause: Schema.Defect() }
) {}

/** A host's all-or-nothing write batch: D1 batch, SQLite transaction. */
export class AtomicWrites extends Context.Service<
  AtomicWrites,
  {
    readonly run: (
      statements: ReadonlyArray<SqlWrite>
    ) => Effect.Effect<void, AtomicWriteError>;
  }
>()('venda/core/AtomicWrites') {}
