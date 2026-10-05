// The legacy core's `Database` over db0, so one adapter covers D1, SQLite,
// libSQL and Postgres. Slice 1 replaces the legacy interface with an Effect
// service; until then this adapter is the only place db0 is touched.
import type { Database, Row } from '@venda/core';
import type { Database as Db0, Primitive } from 'db0';
import { Predicate, Schema } from 'effect';

// D1 reports affected rows as `meta.changes`; node:sqlite and libSQL report `changes`.
const RunResult = Schema.Union([
  Schema.Struct({ meta: Schema.Struct({ changes: Schema.Number }) }),
  Schema.Struct({ changes: Schema.Number })
]);

// What the legacy core binds: text, numbers and NULL, plus booleans and
// undefined, which node:sqlite rejects and are stored as 0/1 and NULL like
// the old adapters did. Anything else is a bug and fails loudly.
const Param = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null, Schema.Undefined]);

const decodeParams = Schema.decodeUnknownSync(Schema.Array(Param));

function bind(params: ReadonlyArray<typeof Param.Type>): Primitive[] {
  return params.map(value => {
    if (Predicate.isBoolean(value)) return value ? 1 : 0;

    return value ?? null;
  });
}

function changesOf(result: typeof RunResult.Type): number {
  return 'meta' in result ? result.meta.changes : result.changes;
}

const decodeRun = Schema.decodeUnknownSync(RunResult);

// Parameter types come from the legacy `Database` interface; they are decoded
// before anything is bound.
export function db0Database(db: Db0): Database {
  return {
    async all<T = Row>(sql: string, ...params: Parameters<Database['run']>[1][]): Promise<T[]> {
      const rows = await db.prepare(sql).all(...bind(decodeParams(params)));

      // SAFETY: the legacy core names the columns of its own queries; slice 1
      // replaces this with Schema-decoded rows.
      return rows as T[];
    },
    async first<T = Row>(sql: string, ...params: Parameters<Database['run']>[1][]): Promise<T | null> {
      const row = await db.prepare(sql).get(...bind(decodeParams(params)));

      // SAFETY: as for `all`; db0 returns undefined when nothing matched.
      return (row ?? null) as T | null;
    },
    run: async (sql, ...params) => ({ changes: changesOf(decodeRun(await db.prepare(sql).run(...bind(decodeParams(params))))) })
  };
}

const decodeApplied = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })));

export interface Migration {
  name: string;
  sql: string;
}

/**
 * Applies pending migrations in name order, each in its own transaction, and
 * records them in `venda_migrations` (the table the legacy SQLite adapter
 * uses, so existing Node databases continue where they left off). For SQLite
 * connections only: D1 is migrated by `wrangler d1 migrations apply`.
 */
export async function migrate(db: Db0, migrations: ReadonlyArray<Migration>): Promise<string[]> {
  await db.exec('CREATE TABLE IF NOT EXISTS venda_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(decodeApplied(await db.prepare('SELECT name FROM venda_migrations').all()).map(row => row.name));
  const pending = migrations.filter(migration => !applied.has(migration.name)).toSorted((a, b) => a.name.localeCompare(b.name));

  for (const migration of pending) {
    await db.exec('BEGIN');

    try {
      await db.exec(migration.sql);
      await db.prepare('INSERT INTO venda_migrations (name, applied_at) VALUES (?, ?)').run(migration.name, new Date().toISOString());
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.name} failed`, { cause: error });
    }
  }

  return pending.map(migration => migration.name);
}
