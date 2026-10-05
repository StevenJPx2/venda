// Node: SQLite and media files under VENDA_DATA_DIR, keys in process memory
// (sessions end when the process restarts), and a one-minute timer.
import { join, resolve } from 'node:path';
import { createDatabase } from 'db0';
import nodeSqlite from 'db0/connectors/node-sqlite';
import { useStorage } from 'nitro/storage';
import { createStorage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';
import memoryDriver from 'unstorage/drivers/memory';
import { db0Database, migrate, type Migration } from '../database';
import type { Platform } from '../platform';
import { keyValue, objectStore } from '../storage';

const TICK_MS = 60_000;

// packages/core/migrations, bundled as the `migrations` server assets (nitro.config.ts).
async function bundledMigrations(): Promise<Migration[]> {
  const assets = useStorage('assets:migrations');
  const names = (await assets.getKeys()).filter(name => name.endsWith('.sql'));

  return Promise.all(names.map(async name => ({ name, sql: String(await assets.getItem(name)) })));
}

export const platform: Platform = {
  async services(env) {
    const dir = resolve(env.VENDA_DATA_DIR ?? '.data');
    const db = createDatabase(nodeSqlite({ path: join(dir, 'venda.sqlite') }));

    await db.exec('PRAGMA foreign_keys = ON');
    await migrate(db, await bundledMigrations());

    return {
      db: db0Database(db),
      storage: objectStore(createStorage({ driver: fsDriver({ base: join(dir, 'media') }) }), { nativeContentType: false }),
      kv: keyValue(createStorage({ driver: memoryDriver() }))
    };
  },
  schedule(hooks, run) {
    let running = false;

    // Runs never overlap; a slow run delays the next one instead of stacking.
    const timer = setInterval(() => {
      if (running) return;

      running = true;
      run().catch(error => console.error('[venda] scheduled run failed', error)).finally(() => { running = false; });
    }, TICK_MS);

    hooks.hook('close', () => clearInterval(timer));
  }
};
