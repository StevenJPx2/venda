// The real app in memory: node:sqlite through Drizzle, drizzle-kit's
// migrations, and unstorage memory mounts for content and the key-value store.
import { readdir, readFile } from 'node:fs/promises';
import { SqliteClient } from '@effect/sql-sqlite-node';
import { createStorage, type Storage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { onTestFinished } from 'vitest';
import { appLoader } from '../src/app';
import type { MigrationFiles } from '../src/migrations';
import type { Target } from '../src/target';
import { sqliteDatabase } from '../src/targets/sqlite';

const DRIZZLE = new URL('../../core/drizzle/', import.meta.url);

/** drizzle-kit's folders as the `assets:migrations` mount presents them. */
export const migrations: MigrationFiles = {
  getKeys: async () =>
    (await readdir(DRIZZLE)).map(name => `${name}:migration.sql`),
  getItem: key => readFile(new URL(key.replace(':', '/'), DRIZZLE), 'utf8')
};

export const OWNER = {
  email: 'owner@venda.test',
  password: 'recovery-password'
};

/** A target in memory; `changed()` plays the file watcher. */
export function memoryTarget(files: Storage) {
  let onChange = () => {};

  const target: Target = {
    database: sqliteDatabase(SqliteClient.layer({ filename: ':memory:' })),
    content: () => ({
      files,
      watch: async listener => {
        onChange = listener;

        return async () => {
          onChange = () => {};
        };
      }
    })
  };

  return { target, changed: () => onChange() };
}

/** Starts the app; it is closed when the test finishes. */
export async function startApp(
  files: Storage = createStorage({ driver: memoryDriver() })
) {
  const { target, changed } = memoryTarget(files);
  const env = {
    VENDA_VERSION: '9.9.9',
    VENDA_OWNER_EMAIL: OWNER.email,
    VENDA_OWNER_PASSWORD: OWNER.password
  };
  const loader = appLoader(
    target,
    () => ({ migrations, keyValue: createStorage({ driver: memoryDriver() }) }),
    () => env
  );

  onTestFinished(loader.close);

  return { app: await loader.load(), changed };
}
