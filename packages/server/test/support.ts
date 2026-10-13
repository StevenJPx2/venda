// The real app in memory: node:sqlite through Drizzle, drizzle-kit's
// migrations, an unstorage memory mount for the key-value store, and content
// imported through the API as the owner would.
import { readdir, readFile } from 'node:fs/promises';
import { SqliteClient } from '@effect/sql-sqlite-node';
import type { Schema } from 'effect';
import { createStorage, type Storage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { onTestFinished } from 'vitest';
import { appLoader, type VendaApp } from '../src/app';
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

/** A target in memory. */
export const memoryTarget = (): Target => ({
  database: sqliteDatabase(SqliteClient.layer({ filename: ':memory:' }))
});

const call = (app: VendaApp, path: string, cookie: string, body: Schema.Json) =>
  app.fetch(
    new Request(`http://venda.test/api${path}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  );

/** The owner's session cookie. */
const ownerSession = async (app: VendaApp) =>
  (await call(app, '/auth/sign-in', '', OWNER)).headers
    .getSetCookie()[0]
    ?.split(';')[0] ?? '';

/** Imports every file of `files` (unstorage keys `blog:hello.md`) as the owner. */
async function importAll(app: VendaApp, files: Storage) {
  const keys = await files.getKeys();
  const texts = await Promise.all(
    keys.map(async key => ({
      path: key.replaceAll(':', '/'),
      text: String(await files.getItemRaw(key))
    }))
  );
  const answer = await call(app, '/admin/import', await ownerSession(app), {
    files: texts
  });

  if (!answer.ok)
    throw new Error(`Import answered ${answer.status}: ${await answer.text()}`);
}

/** Starts the app with `files` imported; it is closed when the test finishes. */
export async function startApp(
  files: Storage = createStorage({ driver: memoryDriver() })
) {
  const env = {
    VENDA_VERSION: '9.9.9',
    VENDA_OWNER_EMAIL: OWNER.email,
    VENDA_OWNER_PASSWORD: OWNER.password
  };
  const loader = appLoader(
    memoryTarget(),
    () => ({ migrations, keyValue: createStorage({ driver: memoryDriver() }) }),
    () => env
  );

  onTestFinished(loader.close);

  const app = await loader.load();

  await importAll(app, files);

  return {
    app,
    /** Writes files as the owner, from the SHAs given, as the CLI does. */
    write: async (
      changes: ReadonlyArray<{
        path: string;
        text: string | null;
        baseSha: string | null;
      }>
    ) =>
      call(app, '/admin/files', await ownerSession(app), {
        message: 'A test change',
        changes
      })
  };
}
