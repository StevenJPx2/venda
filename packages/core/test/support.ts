// A real database for tests: node:sqlite in memory through Drizzle's own
// driver, migrated with drizzle-kit's migrations, plus an in-memory KeyValue.
import { readdirSync, readFileSync } from 'node:fs';
import { SqliteClient } from '@effect/sql-sqlite-node';
import * as SqliteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { Clock, Effect, Layer, Option } from 'effect';
import { KeyValue } from '../src/auth';
import { Database } from '../src/database';

const DRIZZLE = new URL('../drizzle/', import.meta.url);

const MIGRATIONS = readdirSync(DRIZZLE).toSorted().flatMap(name => readFileSync(new URL(`${name}/migration.sql`, DRIZZLE), 'utf8').split('--> statement-breakpoint'));

export const testDatabase = Layer.effect(Database, Effect.gen(function*() {
  const db = yield* SqliteDrizzle.makeWithDefaults({});

  yield* Effect.forEach(MIGRATIONS, statement => db.run(statement), { discard: true });

  return db;
})).pipe(Layer.provide(SqliteClient.layer({ filename: ':memory:' })));

/** Expiring strings in a Map, timed by Effect's Clock so tests can move time. */
export const memoryKeyValue = Layer.sync(KeyValue, () => {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: key => Effect.map(Clock.currentTimeMillis, (now) => {
      const entry = store.get(key);

      return entry !== undefined && entry.expiresAt > now ? Option.some(entry.value) : Option.none();
    }),
    set: (key, value, ttlSeconds) => Effect.map(Clock.currentTimeMillis, now => void store.set(key, { value, expiresAt: now + ttlSeconds * 1000 })),
    remove: key => Effect.sync(() => void store.delete(key))
  };
});
