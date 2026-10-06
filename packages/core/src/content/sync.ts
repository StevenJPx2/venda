// Brings the index up to date with the content store. Each run compares SHAs,
// reads at most `limit` changed files (configs first) and reports what is
// left; a file that cannot be read becomes a problem, never a failed run.
import { readCollectionConfig, readEntry } from '@venda/content';
import { Effect, Option, Result } from 'effect';
import { ContentStore, type StoredFile } from './services';
import {
  clearProblem,
  dropCollection,
  dropEntry,
  forgetFile,
  knownFiles,
  markFile,
  modelOf,
  recordProblem,
  saveCollection,
  saveEntry,
  slugOwner,
  staleEntries
} from './tables';

const CONFIG = /^([^/]+)\/config\.ts$/;

const ENTRY = /^[^/]+\/[^/]+\.mdx?$/;

const COLLECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SyncReport {
  /** Files read this run. */
  readonly indexed: number;
  readonly removed: number;
  /** Changed files left for the next run. */
  readonly remaining: number;
  /** Files read this run that could not be indexed. */
  readonly problems: number;
}

const isContentFile = (path: string) => CONFIG.test(path) || ENTRY.test(path);

const configCollection = (path: string) => CONFIG.exec(path)?.[1];

/** Marks a file as seen and records why it could not be indexed. */
const problem = (file: StoredFile, message: string, line?: number) =>
  Effect.as(
    Effect.all(
      [recordProblem(file.path, message, line), markFile(file.path, file.sha)],
      { discard: true }
    ),
    false
  );

const done = (file: StoredFile) =>
  Effect.as(
    Effect.all([clearProblem(file.path), markFile(file.path, file.sha)], {
      discard: true
    }),
    true
  );

/** Indexes a collection's config; its entries are read again against the new model. */
const indexConfig = Effect.fnUntraced(function* (
  file: StoredFile,
  collection: string
) {
  const store = yield* ContentStore;

  yield* staleEntries(collection, file.path);

  if (!COLLECTION_NAME.test(collection)) {
    yield* dropCollection(collection, file.path);

    return yield* problem(
      file,
      'Collection folders are named in lowercase, with hyphens between words'
    );
  }

  const model = yield* Effect.result(
    readCollectionConfig(file.path, yield* store.read(file.path))
  );

  if (Result.isFailure(model)) {
    yield* dropCollection(collection, file.path);

    return yield* problem(file, model.failure.message, model.failure.line);
  }

  yield* saveCollection(collection, file.path, model.success);

  return yield* done(file);
});

const indexEntry = Effect.fnUntraced(function* (file: StoredFile) {
  const store = yield* ContentStore;
  const collection = file.path.split('/')[0] ?? '';
  const model = yield* modelOf(collection);

  if (Option.isNone(model))
    return yield* Effect.andThen(
      dropEntry(file.path),
      problem(
        file,
        `${collection}/config.ts is missing or invalid, so this entry has no model`
      )
    );

  const entry = yield* Effect.result(
    readEntry(model.value, file.path, yield* store.read(file.path))
  );

  if (Result.isFailure(entry))
    return yield* Effect.andThen(
      dropEntry(file.path),
      problem(file, entry.failure.message, entry.failure.line)
    );

  const owner = yield* slugOwner(collection, entry.success.slug, file.path);

  if (Option.isSome(owner))
    return yield* Effect.andThen(
      dropEntry(file.path),
      problem(
        file,
        `${owner.value} already uses the slug "${entry.success.slug}"`
      )
    );

  yield* saveEntry(file.path, file.sha, entry.success);

  return yield* done(file);
});

/** Removes a deleted file from the index. */
const forget = Effect.fnUntraced(function* (path: string) {
  const collection = configCollection(path);

  if (collection !== undefined) yield* dropCollection(collection, path);
  else yield* dropEntry(path);

  yield* Effect.all([clearProblem(path), forgetFile(path)], { discard: true });
});

const changedFiles = (
  files: ReadonlyArray<StoredFile>,
  known: ReadonlyMap<string, string>
) => files.filter(file => known.get(file.path) !== file.sha);

/** One bounded sync run. Call again while `remaining` is above zero. */
export const syncContent = Effect.fnUntraced(function* (limit = 200) {
  const store = yield* ContentStore;
  const files = (yield* store.list).filter(file => isContentFile(file.path));
  const present = new Set(files.map(file => file.path));
  const gone = [...(yield* knownFiles).keys()].filter(
    path => !present.has(path)
  );

  yield* Effect.forEach(gone, forget, { discard: true });

  const configs = changedFiles(files, yield* knownFiles)
    .filter(file => CONFIG.test(file.path))
    .slice(0, limit);
  const configResults = yield* Effect.forEach(configs, file =>
    indexConfig(file, configCollection(file.path) ?? '')
  );
  const entries = changedFiles(files, yield* knownFiles).filter(file =>
    ENTRY.test(file.path)
  );
  const budget = Math.max(0, limit - configs.length);
  const entryResults = yield* Effect.forEach(
    entries.slice(0, budget),
    indexEntry
  );
  const results = [...configResults, ...entryResults];
  const remaining = changedFiles(files, yield* knownFiles).length;

  return {
    indexed: results.length,
    removed: gone.length,
    remaining,
    problems: results.filter(ok => !ok).length
  } satisfies SyncReport;
});

/** Runs until the index has caught up with the store. */
export const syncAll = Effect.fnUntraced(function* (limit = 200) {
  let total: SyncReport = { indexed: 0, removed: 0, remaining: 0, problems: 0 };

  for (;;) {
    const report = yield* syncContent(limit);

    total = {
      indexed: total.indexed + report.indexed,
      removed: total.removed + report.removed,
      remaining: report.remaining,
      problems: total.problems + report.problems
    };

    if (report.remaining === 0 || report.indexed === 0) return total;
  }
});
