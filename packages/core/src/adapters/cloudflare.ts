import type { Database, KeyValue, ObjectStore, Row } from '../runtime';

// The slices of D1, R2 and KV used here, declared structurally so the core
// does not depend on @cloudflare/workers-types.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Like { prepare(sql: string): D1Statement }

interface R2ObjectLike { body: ReadableStream<Uint8Array>; size: number; httpMetadata?: { contentType?: string } }
interface R2Like {
  put(key: string, value: Blob | ArrayBuffer | Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// KV rejects expirations shorter than a minute.
const MIN_KV_TTL = 60;

export function d1(binding: D1Like): Database {
  return {
    all: async <T = Row>(sql: string, ...params: unknown[]) => (await binding.prepare(sql).bind(...params).all<T>()).results,
    first: <T = Row>(sql: string, ...params: unknown[]) => binding.prepare(sql).bind(...params).first<T>(),
    run: async (sql, ...params) => ({ changes: (await binding.prepare(sql).bind(...params).run()).meta.changes })
  };
}

export function r2(bucket: R2Like): ObjectStore {
  return {
    put: async (key, body, { contentType }) => { await bucket.put(key, body, { httpMetadata: { contentType } }); },
    get: async (key) => {
      const object = await bucket.get(key);
      if (!object) return null;
      return { body: object.body, size: object.size, ...(object.httpMetadata?.contentType ? { contentType: object.httpMetadata.contentType } : {}) };
    },
    delete: key => bucket.delete(key)
  };
}

export function kv(namespace: KvLike): KeyValue {
  return {
    get: key => namespace.get(key),
    put: (key, value, options) => namespace.put(key, value, options?.ttlSeconds ? { expirationTtl: Math.max(MIN_KV_TTL, options.ttlSeconds) } : undefined),
    delete: key => namespace.delete(key)
  };
}
