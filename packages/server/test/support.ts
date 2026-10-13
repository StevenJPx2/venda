// The real app in memory: node:sqlite through Drizzle, drizzle-kit's
// migrations, and unstorage memory mounts for content and the key-value store.
import { readdir, readFile } from 'node:fs/promises';
import { SqliteClient } from '@effect/sql-sqlite-node';
import { createStorage, type Storage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { onTestFinished } from 'vitest';
import { appLoader } from '../src/app';
import { filesStore } from '../src/content';
import type { MigrationFiles } from '../src/migrations';
import type { Target } from '../src/target';
import { sqliteDatabase } from './sqlite';

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

/** A target in memory; `changed()` plays the local content server reporting an edit. */
export function memoryTarget(files: Storage) {
  let dirty = false;

  const target: Target = {
    database: sqliteDatabase(SqliteClient.layer({ filename: ':memory:' })),
    content: () => ({
      store: filesStore(files),
      changed: async () => {
        const was = dirty;

        dirty = false;

        return was;
      }
    })
  };

  return {
    target,
    changed: () => {
      dirty = true;
    }
  };
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
