import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthStatus } from '@venda/contract';
import { createDatabase } from 'db0';
import nodeSqlite from 'db0/connectors/node-sqlite';
import { Schema } from 'effect';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { describe, expect, it } from 'vitest';
import { appLoader } from '../src/app';
import { db0Database, migrate } from '../src/database';
import type { RawEnv } from '../src/env';
import type { Platform } from '../src/platform';
import { keyValue, objectStore } from '../src/storage';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../core/migrations', import.meta.url));

const ENV = { SESSION_SECRET: 'test-secret', ADMIN_EMAIL: 'owner@example.com', ADMIN_PASSWORD: 'recovery-password', VENDA_VERSION: '9.9.9' };

const memoryPlatform: Platform = {
  async services() {
    const db = createDatabase(nodeSqlite({ name: ':memory:' }));
    const names = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql'));

    await migrate(db, await Promise.all(names.map(async name => ({ name, sql: await readFile(join(MIGRATIONS_DIR, name), 'utf8') }))));

    return {
      db: db0Database(db),
      storage: objectStore(createStorage({ driver: memoryDriver() }), { nativeContentType: false }),
      kv: keyValue(createStorage({ driver: memoryDriver() }))
    };
  },
  schedule() {}
};

const request = (path: string, init?: RequestInit) => new Request(`http://venda.test${path}`, init);

describe('the server app', () => {
  it('answers health from the Effect API, with the contract shape', async () => {
    const app = await appLoader(memoryPlatform, () => ENV)();
    const response = await app.fetch(request('/api/health'));

    expect(response.status).toBe(200);
    expect(Schema.decodeUnknownSync(HealthStatus)(await response.json())).toEqual(new HealthStatus({ ok: true, version: '9.9.9' }));
  });

  it('sends every other path to the legacy core', async () => {
    const app = await appLoader(memoryPlatform, () => ENV)();

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
    const load = appLoader(memoryPlatform, () => env);

    await expect(load()).rejects.toThrow('SESSION_SECRET');

    env = ENV;
    expect((await (await load()).fetch(request('/api/health'))).status).toBe(200);
  });
});
