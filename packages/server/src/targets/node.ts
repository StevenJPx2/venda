// Node, Bun and Deno presets: node:sqlite in `.data/venda.sqlite` and the
// `content` folder, both under the working directory (Nitro's convention for
// local data). The folder is watched through its storage mount.
import { mkdirSync } from 'node:fs';
import { SqliteClient } from '@effect/sql-sqlite-node';
import { Database } from '@venda/core/database';
import * as SqliteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/sql';
import { useStorage } from 'nitro/storage';
import type { Target } from '../target';

const DATA_DIR = '.data';

// Editors save in bursts (write, rename, touch); one sync after they settle.
const SETTLE_MS = 150;

const client = Layer.unwrap(Effect.sync(() => {
  mkdirSync(DATA_DIR, { recursive: true });

  return SqliteClient.layer({ filename: `${DATA_DIR}/venda.sqlite` });
}));

export const target: Target = {
  database: {
    layer: Layer.provideMerge(Layer.effect(Database, SqliteDrizzle.makeWithDefaults({})), client),
    atomically: statements => Effect.flatMap(SqlClient.SqlClient, sql => sql.withTransaction(Effect.forEach(statements, each => each, { discard: true })))
  },
  content: () => {
    const files = useStorage('content');

    return {
      files,
      watch: async (onChange) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const unwatch = await files.watch(() => {
          clearTimeout(timer);
          timer = setTimeout(onChange, SETTLE_MS);
        });

        return async () => {
          clearTimeout(timer);
          await unwatch();
        };
      }
    };
  }
};
