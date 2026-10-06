import { readdir, readFile } from 'node:fs/promises';
import { SqliteClient } from '@effect/sql-sqlite-node';
import { CollectionNotFound, HealthStatus, PublicEntry } from '@venda/contract';
import { IndexDb } from '@venda/core/content';
import * as SqliteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { Effect, Layer, Result, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import { createStorage, type Storage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { describe, expect, it, onTestFinished } from 'vitest';
import { appLoader } from '../src/app';
import { migrate, type MigrationFiles, readMigrations } from '../src/migrations';
import type { Target } from '../src/target';

const DRIZZLE = new URL('../../core/drizzle/', import.meta.url);

// drizzle-kit's folders as the `assets:migrations` mount presents them.
const migrations: MigrationFiles = {
  getKeys: async () => (await readdir(DRIZZLE)).map(name => `${name}:migration.sql`),
  getItem: key => readFile(new URL(key.replace(':', '/'), DRIZZLE), 'utf8')
};

const BLOG = "export default defineCollection({ name: 'Blog', kind: 'posts', fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } } });";

/** A target in memory; `changed()` plays the file watcher. */
function memoryTarget(files: Storage) {
  let onChange = () => {};

  const target: Target = {
    database: {
      layer: Layer.provideMerge(Layer.effect(IndexDb, SqliteDrizzle.makeWithDefaults({})), SqliteClient.layer({ filename: ':memory:' })),
      atomically: statements => Effect.flatMap(SqlClient.SqlClient, sql => sql.withTransaction(Effect.forEach(statements, each => each, { discard: true })))
    },
    content: () => ({
      files,
      watch: async (listener) => {
        onChange = listener;

        return async () => {
          onChange = () => {};
        };
      }
    })
  };

  return { target, changed: () => onChange() };
}

const request = (path: string) => new Request(`http://venda.test${path}`);

async function setup() {
  const files = createStorage({ driver: memoryDriver() });

  await files.setItemRaw('blog/config.ts', BLOG);
  await files.setItemRaw('blog/hello.md', '---\ntitle: Hello\npublishedAt: 2026-01-01T00:00:00Z\n---\n\nHi <sup>1</sup>.\n');
  await files.setItemRaw('blog/draft.md', '---\ndraft: true\n---\n');

  const { target, changed } = memoryTarget(files);

  const loader = appLoader(target, () => migrations, () => ({ VENDA_VERSION: '9.9.9' }));

  onTestFinished(loader.close);

  return { app: await loader.load(), files, changed };
}

describe('the server app', () => {
  it('answers health with the contract shape', async () => {
    const { app } = await setup();
    const response = await app.fetch(request('/api/health'));

    expect(Schema.decodeUnknownSync(HealthStatus)(await response.json())).toEqual(new HealthStatus({ ok: true, version: '9.9.9' }));
  });

  it('serves published entries from the content files', async () => {
    const { app } = await setup();
    const list = await app.fetch(request('/api/content/blog'));
    const entries = Schema.decodeUnknownSync(Schema.Array(PublicEntry))(await list.json());

    expect(list.headers.get('cache-control')).toBe('public, max-age=60');
    expect(entries.map(entry => [entry.slug, entry.publishedAt])).toEqual([['hello', '2026-01-01T00:00:00.000Z']]);
    expect(entries[0]?.data.body).toMatchObject({ type: 'doc' });
    expect((await app.fetch(request('/api/content/blog/draft'))).status).toBe(404);
  });

  it('answers unknown collections with a typed 404', async () => {
    const { app } = await setup();
    const response = await app.fetch(request('/api/content/podcasts'));

    expect(response.status).toBe(404);
    expect(Schema.decodeUnknownSync(CollectionNotFound)(await response.json()).collection).toBe('podcasts');
  });

  it('picks up changed files', async () => {
    const { app, files, changed } = await setup();

    await files.setItemRaw('blog/hello.md', '---\ntitle: Changed\n---\n');
    changed();

    const title = async () => Schema.decodeUnknownSync(PublicEntry)(await (await app.fetch(request('/api/content/blog/hello'))).json()).data.title;

    await expect.poll(title).toBe('Changed');
  });
});

describe('migrate', () => {
  it('applies each migration once, atomically', async () => {
    const { target } = memoryTarget(createStorage({ driver: memoryDriver() }));
    const all = await readMigrations(migrations);
    const broken = { name: '99999999999999_broken', statements: ['CREATE TABLE half_done (id TEXT)', 'NOT SQL'] };

    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const first = yield* migrate(target.database, all);
      const second = yield* migrate(target.database, all);
      const failed = yield* Effect.result(migrate(target.database, [...all, broken]));
      const sql = yield* SqlClient.SqlClient;
      const leftovers = yield* sql.unsafe("SELECT name FROM sqlite_master WHERE name = 'half_done'");

      return { first, second, failed: Result.isFailure(failed), leftovers };
    }).pipe(Effect.provide(target.database.layer)));

    expect(outcome.first).toEqual(all.map(each => each.name));
    expect(outcome.second).toEqual([]);
    expect(outcome.failed).toBe(true);
    expect(outcome.leftovers).toEqual([]);
  });
});
