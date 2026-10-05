import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthStatus, PublicEntry } from '@venda/contract';
import { createDatabase } from 'db0';
import nodeSqlite from 'db0/connectors/node-sqlite';
import { Schema } from 'effect';
import { createStorage, type Storage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { describe, expect, it } from 'vitest';
import { appLoader } from '../src/app';
import { db0Database, migrate } from '../src/database';
import type { RawEnv } from '../src/env';
import type { Platform } from '../src/platform';
import { keyValue, objectStore } from '../src/storage';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../core/migrations', import.meta.url));

const ENV = { SESSION_SECRET: 'test-secret', ADMIN_EMAIL: 'owner@example.com', ADMIN_PASSWORD: 'recovery-password', VENDA_VERSION: '9.9.9' };

const BLOG = "export default defineCollection({ name: 'Blog', kind: 'posts', fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } } });";

/** A platform in memory; `content` is the content mount, and `changed()` plays the watcher. */
function memoryPlatform(content?: Storage) {
  let onChange = () => {};

  const platform: Platform = {
    async services() {
      const db = createDatabase(nodeSqlite({ name: ':memory:' }));
      const names = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql'));

      await migrate(db, await Promise.all(names.map(async name => ({ name, sql: await readFile(join(MIGRATIONS_DIR, name), 'utf8') }))));

      return {
        db: db0Database(db),
        index: db,
        storage: objectStore(createStorage({ driver: memoryDriver() }), { nativeContentType: false }),
        kv: keyValue(createStorage({ driver: memoryDriver() })),
        content: content && {
          storage: content,
          watch: (listener) => {
            onChange = listener;

            return () => {};
          }
        }
      };
    },
    schedule() {}
  };

  return { platform, changed: () => onChange() };
}

const request = (path: string, init?: RequestInit) => new Request(`http://venda.test${path}`, init);

describe('the server app', () => {
  it('answers health from the Effect API, with the contract shape', async () => {
    const app = await appLoader(memoryPlatform().platform, () => ENV)();
    const response = await app.fetch(request('/api/health'));

    expect(response.status).toBe(200);
    expect(Schema.decodeUnknownSync(HealthStatus)(await response.json())).toEqual(new HealthStatus({ ok: true, version: '9.9.9' }));
  });

  it('sends every other path to the legacy core', async () => {
    const app = await appLoader(memoryPlatform().platform, () => ENV)();

    const login = await app.fetch(request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD })
    }));

    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';

    expect(login.status).toBe(200);
    expect((await app.fetch(request('/api/collections', { headers: { Cookie: cookie } }))).status).toBe(200);
    expect((await app.fetch(request('/api/collections'))).status).toBe(401);
  });

  it('rejects a missing secret, and retries the build afterwards', async () => {
    let env: RawEnv = { ...ENV, SESSION_SECRET: undefined };
    const load = appLoader(memoryPlatform().platform, () => env);

    await expect(load()).rejects.toThrow('SESSION_SECRET');

    env = ENV;
    expect((await (await load()).fetch(request('/api/health'))).status).toBe(200);
  });
});

describe('content from files', () => {
  async function setup() {
    const content = createStorage({ driver: memoryDriver() });

    await content.setItemRaw('blog/config.ts', BLOG);
    await content.setItemRaw('blog/hello.md', '---\ntitle: Hello\npublishedAt: 2026-01-01T00:00:00Z\n---\n\nHi <sup>1</sup>.\n');
    await content.setItemRaw('blog/draft.md', '---\ndraft: true\n---\n');

    const { platform, changed } = memoryPlatform(content);

    return { app: await appLoader(platform, () => ENV)(), content, changed };
  }

  it('serves published entries of file collections, in the legacy shape', async () => {
    const { app } = await setup();
    const list = await app.fetch(request('/api/content/blog'));

    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('public, max-age=60');

    const entries: unknown = await list.json();

    expect(entries).toEqual([expect.objectContaining({ id: 'blog/hello', collectionId: 'blog', slug: 'hello', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z' })]);
    expect(Schema.decodeUnknownSync(Schema.Array(PublicEntry))(entries)[0]?.data.body).toMatchObject({ type: 'doc' });
    expect((await app.fetch(request('/api/content/blog/hello'))).status).toBe(200);
    expect((await app.fetch(request('/api/content/blog/draft'))).status).toBe(404);
  });

  it('leaves collections it does not know to the legacy core', async () => {
    const { app } = await setup();
    const response = await app.fetch(request('/api/content/podcasts'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Collection not found' });
  });

  it('picks up changed files', async () => {
    const { app, content, changed } = await setup();

    await content.setItemRaw('blog/hello.md', '---\ntitle: Changed\n---\n');
    changed();

    const title = async () => Schema.decodeUnknownSync(PublicEntry)(await (await app.fetch(request('/api/content/blog/hello'))).json()).data.title;

    await expect.poll(title).toBe('Changed');
  });
});
