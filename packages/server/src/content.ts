// The content store over a Nitro storage mount, and the sync runner.
import {
  ContentStore,
  ContentStoreError,
  gitBlobSha,
  syncAll,
  type SyncReport
} from '@venda/core/content';
import type { Database } from '@venda/core/database';
import { Effect, Layer, Predicate } from 'effect';
import type { ContentFiles, RawFile } from './target';

// Only these are read and hashed; images and other files beside them are skipped.
const CONTENT_FILE = /(?:^|\/)(?:config\.ts|[^/]+\.mdx?)$/;

const decoder = new TextDecoder();

const encoder = new TextEncoder();

function bytesOf(raw: RawFile): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Predicate.isString(raw)) return encoder.encode(raw);

  return new Uint8Array();
}

const storeError = (message: string) => (cause: unknown) =>
  new ContentStoreError({ message, cause });

/** Content files over a storage mount; unstorage names `blog/hello.md` with the key `blog:hello.md`. */
export const contentStoreLayer = (files: ContentFiles) => {
  const bytes = (path: string) =>
    Effect.tryPromise({
      try: async () =>
        bytesOf(await files.getItemRaw(path.replaceAll('/', ':'))),
      catch: storeError(`Could not read ${path}`)
    });

  return Layer.succeed(ContentStore, {
    list: Effect.gen(function* () {
      const keys = yield* Effect.tryPromise({
        try: () => files.getKeys(),
        catch: storeError('Could not list content files')
      });
      const paths = keys
        .map(key => key.replaceAll(':', '/'))
        .filter(path => CONTENT_FILE.test(path));

      return yield* Effect.forEach(
        paths,
        path =>
          Effect.flatMap(bytes(path), content =>
            Effect.promise(async () => ({
              path,
              sha: await gitBlobSha(content)
            }))
          ),
        { concurrency: 16 }
      );
    }),
    read: path => Effect.map(bytes(path), content => decoder.decode(content))
  });
};

/** Runs an effect against the app's content store and index. */
export type RunContent = <A, E>(
  effect: Effect.Effect<A, E, ContentStore | Database>
) => Promise<A>;

const describe = (report: SyncReport) =>
  `indexed ${report.indexed}, removed ${report.removed}, ${report.problems} with problems`;

/**
 * Syncs the files into the index on demand. Runs never overlap: a request
 * during a run queues one more run after it, so no change is missed.
 */
export function contentSync(run: RunContent): () => Promise<void> {
  let running: Promise<void> | undefined;
  let again = false;

  const once = () =>
    run(syncAll()).then(
      report => {
        if (report.indexed || report.removed)
          console.info(`[venda] content sync: ${describe(report)}`);
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
