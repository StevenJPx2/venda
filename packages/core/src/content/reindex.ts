// The index rows for some changed files, read from the files as they will be
// after the write (files.ts), so a model and its entries can change in one
// batch. A config change re-reads every entry of its collection. A file the
// index cannot read is recorded as a problem with the reason, never dropped.
import {
  readCollectionConfig,
  readEntry,
  readSiteConfig,
  textSha,
  type CollectionModel
} from '@venda/content';
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors';
import { Effect, Option, Result } from 'effect';
import type { Database, SqlWrite } from '../database';

import { dropSite, saveSite, SITE_PATH } from './site';
import {
  clearProblem,
  dropCollection,
  dropEntry,
  modelOf,
  recordProblem,
  saveCollection,
  saveEntry,
  slugOwner
} from './tables';

const CONFIG = /^([^/]+)\/config\.ts$/;

const ENTRY = /^[^/]+\/[^/]+\.mdx?$/;

const COLLECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Read<A> = Effect.Effect<A, EffectDrizzleQueryError, Database>;

/** The files as a write will leave them. */
export interface FileView {
  /** A file's text, or undefined when it does not (or will no longer) exist. */
  readonly read: (path: string) => Read<string | undefined>;
  /** Every entry file of a collection. */
  readonly entriesOf: (collection: string) => Read<string[]>;
}

/** The index's statements, and why each unreadable file could not be read. */
interface Reindexed {
  readonly writes: SqlWrite[];
  readonly problems: Map<string, string>;
}

interface Batch extends Reindexed {
  /** Models of the collections whose config changed in this write (null: none valid). */
  readonly models: Map<string, CollectionModel | null>;
  /** Slugs claimed in this write: `<collection>/<slug>` → path. */
  readonly slugs: Map<string, string>;
  /** Entry files this write reads again. */
  readonly entries: Set<string>;
}

const keep = (batch: Batch, ...parts: ReadonlyArray<ReadonlyArray<SqlWrite>>) =>
  void batch.writes.push(...parts.flat());

const fail = (batch: Batch, path: string, message: string, line?: number) =>
  Effect.map(recordProblem(path, message, line), writes => {
    batch.problems.set(path, message);
    keep(batch, writes);
  });

const indexSite = Effect.fnUntraced(function* (batch: Batch, text?: string) {
  if (text === undefined)
    return keep(batch, yield* dropSite, yield* clearProblem(SITE_PATH));

  const settings = yield* Effect.result(readSiteConfig(SITE_PATH, text));

  if (Result.isFailure(settings)) {
    keep(batch, yield* dropSite);

    return yield* fail(
      batch,
      SITE_PATH,
      settings.failure.message,
      settings.failure.line
    );
  }

  keep(
    batch,
    yield* saveSite(SITE_PATH, settings.success),
    yield* clearProblem(SITE_PATH)
  );
});

const indexConfig = Effect.fnUntraced(function* (
  batch: Batch,
  path: string,
  text?: string
) {
  const collection = CONFIG.exec(path)?.[1] ?? '';

  batch.models.set(collection, null);
  keep(batch, yield* dropCollection(collection));

  if (text === undefined) return keep(batch, yield* clearProblem(path));

  if (!COLLECTION_NAME.test(collection))
    return yield* fail(
      batch,
      path,
      'Collection folders are named in lowercase, with hyphens between words'
    );

  const model = yield* Effect.result(readCollectionConfig(path, text));

  if (Result.isFailure(model))
    return yield* fail(batch, path, model.failure.message, model.failure.line);

  batch.models.set(collection, model.success);
  keep(
    batch,
    yield* saveCollection(collection, path, model.success),
    yield* clearProblem(path)
  );
});

/** The model an entry is read against: this write's, or the indexed one. */
const modelFor = (batch: Batch, collection: string) =>
  batch.models.has(collection)
    ? Effect.succeed(batch.models.get(collection) ?? null)
    : Effect.map(modelOf(collection), Option.getOrNull);

/** Another file already using this slug: in this write first, then in the index. */
const slugTaken = (
  batch: Batch,
  collection: string,
  slug: string,
  path: string
) =>
  Effect.gen(function* () {
    const here = batch.slugs.get(`${collection}/${slug}`);

    if (here !== undefined) return here;

    const indexed = yield* slugOwner(collection, slug, path);

    // A file this write reads again settles its own slug in this write.
    return Option.isSome(indexed) && !batch.entries.has(indexed.value)
      ? indexed.value
      : undefined;
  });

const indexEntry = Effect.fnUntraced(function* (
  batch: Batch,
  path: string,
  text?: string
) {
  keep(batch, yield* dropEntry(path));

  if (text === undefined) return keep(batch, yield* clearProblem(path));

  const collection = path.split('/')[0] ?? '';
  const model = yield* modelFor(batch, collection);

  if (model === null)
    return yield* fail(
      batch,
      path,
      `${collection}/config.ts is missing or invalid, so this entry has no model`
    );

  const entry = yield* Effect.result(readEntry(model, path, text));

  if (Result.isFailure(entry))
    return yield* fail(batch, path, entry.failure.message, entry.failure.line);

  const owner = yield* slugTaken(batch, collection, entry.success.slug, path);

  if (owner !== undefined)
    return yield* fail(
      batch,
      path,
      `${owner} already uses the slug "${entry.success.slug}"`
    );

  batch.slugs.set(`${collection}/${entry.success.slug}`, path);
  keep(
    batch,
    yield* saveEntry(
      path,
      yield* Effect.promise(() => textSha(text)),
      entry.success,
      model
    ),
    yield* clearProblem(path)
  );
});

/** The index changes for `paths`: settings first, then every entry they touch. */
export const reindex = Effect.fnUntraced(function* (
  view: FileView,
  paths: ReadonlyArray<string>
) {
  const batch: Batch = {
    writes: [],
    problems: new Map(),
    models: new Map(),
    slugs: new Map(),
    entries: new Set(paths.filter(path => ENTRY.test(path)))
  };

  for (const path of [...paths].sort()) {
    if (path === SITE_PATH) yield* indexSite(batch, yield* view.read(path));
    else if (CONFIG.test(path))
      yield* indexConfig(batch, path, yield* view.read(path));
  }

  for (const collection of batch.models.keys())
    for (const path of yield* view.entriesOf(collection))
      batch.entries.add(path);

  for (const path of [...batch.entries].sort())
    yield* indexEntry(batch, path, yield* view.read(path));

  return { writes: batch.writes, problems: batch.problems } satisfies Reindexed;
});
