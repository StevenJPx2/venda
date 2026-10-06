// Node, Bun and Deno presets: node:sqlite in `.data/venda.sqlite` and the
// `content` folder, both under the working directory (Nitro's convention for
// local data). The folder is watched through its storage mount.
import { mkdirSync } from 'node:fs';
import { SqliteClient } from '@effect/sql-sqlite-node';
import { Effect, Layer } from 'effect';
import { useStorage } from 'nitro/storage';
import type { Target } from '../target';
import { sqliteDatabase } from './sqlite';

const DATA_DIR = '.data';

// Editors save in bursts (write, rename, touch); one sync after they settle.
const SETTLE_MS = 150;

const client = Layer.unwrap(
  Effect.sync(() => {
    mkdirSync(DATA_DIR, { recursive: true });

    return SqliteClient.layer({ filename: `${DATA_DIR}/venda.sqlite` });
  })
);

export const target: Target = {
  database: sqliteDatabase(client),
  content: () => {
    const files = useStorage('content');

    return {
      files,
      watch: async onChange => {
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
