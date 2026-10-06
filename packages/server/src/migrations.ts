// Applies drizzle-kit's pending migrations at startup on every runtime. Each
// migration and its record in `venda_migrations` go in one atomic step, so a
// failure leaves nothing half applied and the next start retries it.
import { DateTime, Effect, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import type { DatabaseDriver } from './target';

export interface Migration {
  readonly name: string;
  readonly statements: ReadonlyArray<string>;
}

/** What a storage mount holds under a key (unstorage's `StorageValue`). */
type StoredValue = string | number | boolean | object | null;

/** The parts of a Nitro asset mount the runner reads. */
export interface MigrationFiles {
  getKeys(): Promise<string[]>;
  getItem(key: string): Promise<StoredValue>;
}

const decodeText = Schema.decodeUnknownSync(Schema.String);

/** `packages/core/drizzle/<name>/migration.sql`, in name (timestamp) order, one statement at a time. */
export async function readMigrations(files: MigrationFiles): Promise<Migration[]> {
  const keys = (await files.getKeys()).filter(key => key.endsWith(':migration.sql')).toSorted();

  return Promise.all(keys.map(async key => ({
    name: key.replace(/:migration\.sql$/, ''),
    statements: decodeText(await files.getItem(key)).split('--> statement-breakpoint').map(each => each.trim()).filter(Boolean)
  })));
}

const Applied = Schema.Array(Schema.Struct({ name: Schema.String }));

/** Applies what has not been applied yet; returns the names it applied. */
export const migrate = Effect.fnUntraced(function*(driver: DatabaseDriver, migrations: ReadonlyArray<Migration>) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql.unsafe('CREATE TABLE IF NOT EXISTS venda_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

  const rows = yield* sql.unsafe('SELECT name FROM venda_migrations');
  const applied = new Set((yield* Effect.orDie(Schema.decodeUnknownEffect(Applied)(rows))).map(row => row.name));
  const pending = migrations.filter(migration => !applied.has(migration.name));

  for (const migration of pending) {
    const record = sql.unsafe('INSERT INTO venda_migrations (name, applied_at) VALUES (?, ?)', [migration.name, DateTime.formatIso(yield* DateTime.now)]);

    yield* driver.atomically([...migration.statements.map(statement => sql.unsafe(statement)), record]);
  }

  return pending.map(migration => migration.name);
});
