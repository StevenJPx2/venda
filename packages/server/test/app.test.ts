import { CollectionNotFound, HealthStatus, PublicEntry } from '@venda/contract';
import { textSha } from '@venda/core/content';
import { Effect, Result, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { describe, expect, it } from 'vitest';
import { migrate, readMigrations } from '../src/migrations';
import { memoryTarget, migrations, startApp } from './support';

const BLOG =
  "export default defineCollection({ name: 'Blog', kind: 'posts', fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } } });";

const request = (path: string) => new Request(`http://venda.test${path}`);

async function setup() {
  const files = createStorage({ driver: memoryDriver() });

  await files.setItemRaw('blog/config.ts', BLOG);
  await files.setItemRaw(
    'blog/hello.md',
    '---\ntitle: Hello\npublishedAt: 2026-01-01T00:00:00Z\n---\n\nHi <sup>1</sup>.\n'
  );
  await files.setItemRaw('blog/draft.md', '---\ndraft: true\n---\n');

  return startApp(files);
}

describe('the server app', () => {
  it('answers health with the contract shape', async () => {
    const { app } = await setup();
    const response = await app.fetch(request('/api/health'));

    expect(
      Schema.decodeUnknownSync(HealthStatus)(await response.json())
    ).toEqual(new HealthStatus({ ok: true, version: '9.9.9' }));
  });

  it('serves published entries from the content files', async () => {
    const { app } = await setup();
    const list = await app.fetch(request('/api/content/blog'));
    const entries = Schema.decodeUnknownSync(Schema.Array(PublicEntry))(
      await list.json()
    );

    expect(list.headers.get('cache-control')).toBe('public, max-age=60');
    expect(list.headers.get('access-control-allow-origin')).toBe('*');
    expect(
      (await app.fetch(request('/api/site'))).headers.get(
        'access-control-allow-origin'
      )
    ).toBe('*');
    expect(
      (await app.fetch(request('/api/auth/me'))).headers.get(
        'access-control-allow-origin'
      )
    ).toBeNull();
    expect(entries.map(entry => [entry.slug, entry.publishedAt])).toEqual([
      ['hello', '2026-01-01T00:00:00.000Z']
    ]);
    expect(entries[0]?.data.body).toMatchObject({ type: 'doc' });
    expect((await app.fetch(request('/api/content/blog/draft'))).status).toBe(
      404
    );
  });

  it('answers unknown collections with a typed 404', async () => {
    const { app } = await setup();
    const response = await app.fetch(request('/api/content/podcasts'));

    expect(response.status).toBe(404);
    expect(
      Schema.decodeUnknownSync(CollectionNotFound)(await response.json())
        .collection
    ).toBe('podcasts');
  });

  it('serves a written file at once, and refuses a write from a stale SHA', async () => {
    const { app, write } = await setup();
    const title = async () =>
      Schema.decodeUnknownSync(PublicEntry)(
        await (await app.fetch(request('/api/content/blog/hello'))).json()
      ).data.title;
    const listed = await app.fetch(
      new Request('http://venda.test/api/admin/files')
    );
    const changed = '---\ntitle: Changed\n---\n';
    const base = await textSha(
      '---\ntitle: Hello\npublishedAt: 2026-01-01T00:00:00Z\n---\n\nHi <sup>1</sup>.\n'
    );
    const written = await write([
      { path: 'blog/hello.md', text: changed, baseSha: base }
    ]);
    const stale = await write([
      { path: 'blog/hello.md', text: 'x', baseSha: base }
    ]);

    expect(listed.status).toBe(401);
    expect(written.status).toBe(200);
    expect(await title()).toBe('Changed');
    expect(stale.status).toBe(409);
    expect(await title()).toBe('Changed');
  });
});

describe('migrate', () => {
  it('applies each migration once, atomically', async () => {
    const target = memoryTarget();
    const all = await readMigrations(migrations);
    const broken = {
      name: '99999999999999_broken',
      statements: ['CREATE TABLE half_done (id TEXT)', 'NOT SQL']
    };

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* migrate(target.database, all);
        const second = yield* migrate(target.database, all);
        const failed = yield* Effect.result(
          migrate(target.database, [...all, broken])
        );
        const sql = yield* SqlClient.SqlClient;
        const leftovers = yield* sql.unsafe(
          "SELECT name FROM sqlite_master WHERE name = 'half_done'"
        );

        return { first, second, failed: Result.isFailure(failed), leftovers };
      }).pipe(Effect.provide(target.database.layer))
    );

    expect(outcome.first).toEqual(all.map(each => each.name));
    expect(outcome.second).toEqual([]);
    expect(outcome.failed).toBe(true);
    expect(outcome.leftovers).toEqual([]);
  });
});
