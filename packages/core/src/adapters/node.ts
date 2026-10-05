import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { Database, KeyValue, ObjectStore, Row } from '../runtime';

/** Core schema migrations shipped with this package (shared with D1). */
export const coreMigrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

function toSql(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' || value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

export interface SqliteDatabase extends Database {
  /** Applies pending `.sql` migrations in filename order; returns the ones applied. */
  migrate(dir?: string): Promise<string[]>;
  close(): void;
}

/** SQLite through Node's built-in driver. Pass `':memory:'` for a throwaway database. */
export function sqlite(filename: string): SqliteDatabase {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  const bind = (params: unknown[]) => params.map(toSql);

  return {
    all: async <T = Row>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...bind(params)) as T[],
    first: async <T = Row>(sql: string, ...params: unknown[]) => (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null,
    run: async (sql, ...params) => ({ changes: Number(db.prepare(sql).run(...bind(params)).changes) }),
    async migrate(dir = coreMigrationsDir) {
      db.exec('CREATE TABLE IF NOT EXISTS venda_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
      const done = new Set((db.prepare('SELECT name FROM venda_migrations').all() as { name: string }[]).map(row => row.name));
      const pending = (await readdir(dir)).filter(name => name.endsWith('.sql') && !done.has(name)).sort();

      for (const name of pending) {
        const sql = await readFile(join(dir, name), 'utf8');
        db.exec('BEGIN');

        try {
          db.exec(sql);
          db.prepare('INSERT INTO venda_migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return pending;
    },
    close: () => db.close()
  };
}

/** Media stored as files under `root`, with a small metadata file beside each object. */
export function fileStore(root: string): ObjectStore {
  const base = resolve(root);

  const pathFor = (key: string) => {
    const path = resolve(base, key);
    if (!path.startsWith(base + sep)) throw new Error('Invalid object key');
    return path;
  };

  return {
    async put(key, body, { contentType }) {
      const path = pathFor(key);
      const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : new Uint8Array(body instanceof ArrayBuffer ? body : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
    },
    async get(key) {
      const path = pathFor(key);

      try {
        const [info, meta] = await Promise.all([stat(path), readFile(`${path}.meta.json`, 'utf8').then(text => JSON.parse(text) as { contentType?: string }).catch(() => ({} as { contentType?: string }))]);
        const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
        return { body, size: info.size, ...(meta.contentType ? { contentType: meta.contentType } : {}) };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = pathFor(key);
      await Promise.all([rm(path, { force: true }), rm(`${path}.meta.json`, { force: true })]);
    }
  };
}

/**
 * Runs `venda.scheduled()` every `intervalMs` (default one minute) in this
 * process. Runs never overlap; returns a function that stops the timer.
 */
export function startScheduler(venda: { scheduled(): Promise<unknown> }, options: { intervalMs?: number; onError?: (error: unknown) => void } = {}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    venda.scheduled().catch(options.onError ?? console.error).finally(() => { running = false; });
  }, options.intervalMs ?? 60_000);
  return () => clearInterval(timer);
}

/** Process-local key-value store; suitable for a single Node process or tests. */
export function memoryKv(): KeyValue {
  const values = new Map<string, { value: string; expiresAt?: number }>();
  return {
    async get(key) {
      const item = values.get(key);
      if (!item) return null;

      if (item.expiresAt !== undefined && item.expiresAt <= Date.now()) {
        values.delete(key);
        return null;
      }

      return item.value;
    },
    async put(key, value, options) {
      values.set(key, options?.ttlSeconds ? { value, expiresAt: Date.now() + options.ttlSeconds * 1000 } : { value });
    },
    async delete(key) {
      values.delete(key);
    }
  };
}
