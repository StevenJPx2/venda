// Services the core runs on. Each host supplies implementations: Cloudflare
// (D1, R2, KV), Node (SQLite, filesystem, memory) or anything else that fits.

export type Row = Record<string, unknown>;

/** A SQL database speaking SQLite-compatible `?` placeholders. */
export interface Database {
  all<T = Row>(sql: string, ...params: unknown[]): Promise<T[]>;
  first<T = Row>(sql: string, ...params: unknown[]): Promise<T | null>;
  /** Executes a write; `changes` is the number of rows affected. */
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  size?: number;
}

/** Binary object storage for media. */
export interface ObjectStore {
  put(key: string, body: Blob | ArrayBuffer | Uint8Array, options: { contentType: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** String key-value storage for sessions and caches; values may expire. */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface VendaConfig {
  db: Database;
  storage: ObjectStore;
  kv: KeyValue;
  /**
   * Recovery administrator. Signing in with these credentials always yields an
   * active administrator account, so access survives a lost password.
   */
  admin?: { email: string; password: string };
  /** Signs session cookies; use a long random value. */
  sessionSecret: string;
  /** Origins allowed to call admin endpoints cross-origin (a list, or comma-separated). */
  adminOrigins?: string[] | string;
  /** Reported by /api/health. */
  version?: string;
  /** Serves non-API requests, e.g. the admin SPA's static files. */
  assets?: (request: Request) => Promise<Response>;
}
