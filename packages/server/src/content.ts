// The core's content services over db0 and unstorage, and the sync runner.
import { ContentStore, ContentStoreError, gitBlobSha, IndexDb, IndexDbError, syncAll, type SyncReport } from '@venda/core/content';
import type { Database as Db0 } from 'db0';
import { Effect, Layer, Predicate } from 'effect';
import type { Storage } from 'unstorage';

/** The parts of an unstorage mount the content store reads (Nitro's `useStorage` has its own copy of the types). */
export type ContentFiles = Pick<Storage, 'getKeys' | 'getItemRaw'>;

/** Where content files come from, and how to hear that they changed. */
export interface ContentSource {
  readonly storage: ContentFiles;
  /** Calls `onChange` after files change; returns a function that stops watching. */
  readonly watch?: (onChange: () => void) => () => void;
}

export const indexDbLayer = (db: Db0) => Layer.succeed(IndexDb, {
  all: (sql, params = []) => Effect.tryPromise({
    try: () => db.prepare(sql).all(...params),
    catch: cause => new IndexDbError({ message: `Index query failed: ${sql}`, cause })
  }),
  run: (sql, params = []) => Effect.tryPromise({
    try: async () => void await db.prepare(sql).run(...params),
    catch: cause => new IndexDbError({ message: `Index write failed: ${sql}`, cause })
  })
});

// Only these are read and hashed; images and other files beside them are skipped.
const CONTENT_FILE = /(?:^|\/)(?:config\.ts|[^/]+\.mdx?)$/;

const decoder = new TextDecoder();

const encoder = new TextEncoder();

// The filesystem driver returns bytes; bundled assets may come back as text.
type RawFile = Uint8Array | ArrayBuffer | string | null;

function bytesOf(raw: RawFile): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Predicate.isString(raw)) return encoder.encode(raw);

  return new Uint8Array();
}

const storeError = (message: string) => (cause: unknown) => new ContentStoreError({ message, cause });

/** Content files over an unstorage mount; unstorage writes `blog/hello.md` as the key `blog:hello.md`. */
const contentStoreLayer = (storage: ContentFiles) => {
  const bytes = (path: string) => Effect.tryPromise({ try: async () => bytesOf(await storage.getItemRaw<RawFile>(path.replaceAll('/', ':'))), catch: storeError(`Could not read ${path}`) });

  return Layer.succeed(ContentStore, {
    list: Effect.gen(function*() {
      const keys = yield* Effect.tryPromise({ try: () => storage.getKeys(), catch: storeError('Could not list content files') });
      const paths = keys.map(key => key.replaceAll(':', '/')).filter(path => CONTENT_FILE.test(path));

      return yield* Effect.forEach(paths, path => Effect.flatMap(bytes(path), content => Effect.promise(async () => ({ path, sha: await gitBlobSha(content) }))), { concurrency: 16 });
    }),
    read: path => Effect.map(bytes(path), content => decoder.decode(content))
  });
};

const describe = (report: SyncReport) => `indexed ${report.indexed}, removed ${report.removed}, ${report.problems} with problems`;

/**
 * Syncs `source` into the index on demand. Runs never overlap: a request
 * during a run queues one more run after it, so no change is missed.
 */
export function contentSync(source: ContentSource, db: Db0): () => Promise<void> {
  const layer = Layer.mergeAll(contentStoreLayer(source.storage), indexDbLayer(db));
  let running: Promise<void> | undefined;
  let again = false;

  const once = () => Effect.runPromise(Effect.provide(syncAll(), layer)).then(
    (report) => {
      if (report.indexed || report.removed) console.info(`[venda] content sync: ${describe(report)}`);
    },
    error => console.error('[venda] content sync failed', error)
  );

  const loop = async () => {
    do {
      again = false;
      await once();
    } while (again);

    running = undefined;
  };

  return () => {
    if (running) again = true;

    running ??= loop();

    return running;
  };
}
