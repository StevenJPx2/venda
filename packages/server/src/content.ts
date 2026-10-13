// The content store over a Nitro storage mount, and the sync runner.
import {
  ContentStore,
  ContentStoreError,
  contentSchema,
  requestSync,
  snapshotOf,
  sourceState,
  syncAll,
  type ContentCommit,
  type ContentFileStore,
  type SyncReport
} from '@venda/core/content';
import type { AtomicWrites, Database } from '@venda/core/database';
import { Conflict, ContentReadOnly } from '@venda/contract';
import { Effect, Layer, type Option, Predicate } from 'effect';
import type { ContentFiles, ContentSource, RawFile } from './target';

// Only these are read and hashed; images and other files beside them are skipped.
const CONTENT_FILE = /^site\.ts$|(?:^|\/)(?:config\.ts|[^/]+\.mdx?)$/;

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

/** Folder and bundled sources capture bytes before advertising their SHAs. */
const captureContent = (files: ContentFiles) =>
  Effect.gen(function* () {
    const keys = yield* Effect.tryPromise({
      try: () => files.getKeys(),
      catch: storeError('Could not list content files')
    });
    const paths = keys
      .map(key => key.replaceAll(':', '/'))
      .filter(path => CONTENT_FILE.test(path));
    // A file that vanishes mid-capture fails the pass; the next one retries.
    const texts = yield* Effect.forEach(
      paths,
      path =>
        Effect.tryPromise({
          try: async () => {
            const raw = await files.getItemRaw(path.replaceAll('/', ':'));

            if (raw === null) throw new Error(`${path} vanished while reading`);

            return decoder.decode(bytesOf(raw));
          },
          catch: storeError(`Could not read ${path}`)
        }),
      { concurrency: 16 }
    );

    return yield* snapshotOf(
      new Map(paths.map((path, at) => [path, texts[at] ?? '']))
    );
  });

/**
 * A store over a storage mount (the bundled folder, or the local content
 * server); unstorage names `blog/hello.md` with the key `blog:hello.md`.
 */
export const filesStore = (
  files: ContentFiles,
  commit?: (input: ContentCommit) => Promise<{ readonly sha: string }>
): ContentFileStore => {
  const bytes = (path: string) =>
    Effect.tryPromise({
      try: async () =>
        bytesOf(await files.getItemRaw(path.replaceAll('/', ':'))),
      catch: storeError(`Could not read ${path}`)
    });

  return {
    writable: commit !== undefined,
    snapshot: captureContent(files),
    commit: input =>
      commit
        ? Effect.tryPromise({
            try: () => commit(input),
            catch: cause =>
              cause instanceof Conflict
                ? cause
                : new ContentStoreError({
                    message: `Could not write ${input.path}`,
                    cause
                  })
          })
        : Effect.fail(new ContentReadOnly()),
    // A folder's SHAs come from its bytes, so listing it is reading it.
    list: Effect.map(captureContent(files), snapshot => snapshot.files),
    read: path => Effect.map(bytes(path), content => decoder.decode(content))
  };
};

export const contentStoreLayer = (source: ContentSource) =>
  Layer.succeed(ContentStore, source.store);

/** Runs an effect against the app's content store and index. */
export type RunContent = <A, E>(
  effect: Effect.Effect<A, E, ContentStore | Database | AtomicWrites>
) => Promise<A>;

const describe = (report: SyncReport) =>
  `${report.outcome}: indexed ${report.indexed}, removed ${report.removed}, ${report.problems} with problems, ${report.remaining} left`;

export interface ContentSync {
  /**
   * Runs passes until the index has caught up. One run per isolate at a time
   * (a call during a run shares it); across isolates the source's lease
   * admits one pass at a time. Never rejects: a failure is logged and kept
   * in the source's state for the next try.
   */
  readonly catchUp: () => Promise<void>;
  /** Resolves once this isolate has no run in progress. */
  readonly settled: () => Promise<void>;
  /** Asks for a pass: something changed at the source. */
  readonly request: () => Promise<void>;
  /** Where the index stands against the source. */
  readonly state: () => Promise<SourceState>;
}

export type SourceState = Option.Option<
  typeof contentSchema.contentSource.$inferSelect
>;

export function contentSync(run: RunContent): ContentSync {
  let running: Promise<void> | undefined;

  const once = () =>
    run(syncAll())
      .then(
        report => {
          if (report.indexed || report.removed || report.outcome === 'failed')
            console.info(`[venda] content sync ${describe(report)}`);
        },
        error => console.error('[venda] content sync failed', error)
      )
      .finally(() => {
        running = undefined;
      });

  return {
    catchUp: () => {
      running ??= once();

      return running;
    },
    settled: () => running ?? Promise.resolve(),
    request: () => run(Effect.asVoid(requestSync)),
    state: () => run(sourceState)
  };
}
