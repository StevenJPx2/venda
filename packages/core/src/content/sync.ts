// Brings the index up to date with the content store, one bounded pass at a
// time. A pass holds the source's lease, reads one pinned snapshot, compares
// SHAs and reads at most `limit` changed files (configs first). Each file's
// changes are one guarded batch (source-state.ts), so a pass that lost its
// lease, or began before a publish, writes nothing over newer work. A file
// that cannot be read becomes a problem, never a failed pass.
import {
  readCollectionConfig,
  readEntry,
  readSiteConfig
} from '@venda/content';
import { MAX_CONTENT_BYTES } from '@venda/contract';
import { Clock, DateTime, Effect, Option, Result } from 'effect';
import { AtomicWrites, type SqlWrite } from '../database';
import {
  ContentStore,
  type ContentSnapshot,
  type StoredFile
} from './services';
import { dropSite, saveSite, SITE_PATH } from './site';
import {
  abandonPass,
  claimPass,
  finishPass,
  guarded,
  sourceState,
  type SyncPass
} from './source-state';
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

/**
 * How a pass ended: caught up, more to do, someone else holds the lease, a
 * newer fence or publish refused its writes, or the source failed.
 */
export type SyncOutcome = 'done' | 'more' | 'busy' | 'superseded' | 'failed';

export interface SyncReport {
  readonly outcome: SyncOutcome;
  /** Files read by this pass. */
  readonly indexed: number;
  readonly removed: number;
  /** Changed files left for the next pass. */
  readonly remaining: number;
  /** Files read by this pass that could not be indexed. */
  readonly problems: number;
}

/** A file's index changes, and whether it indexed cleanly. */
interface Indexed {
  readonly ok: boolean;
  readonly writes: ReadonlyArray<SqlWrite>;
}

interface Pass {
  readonly claim: SyncPass;
  readonly snapshot: ContentSnapshot;
}

const isSettings = (path: string) => path === SITE_PATH || CONFIG.test(path);

const isContentFile = (path: string) => isSettings(path) || ENTRY.test(path);

const configCollection = (path: string) => CONFIG.exec(path)?.[1];

const gather = (
  ok: boolean,
  ...parts: ReadonlyArray<ReadonlyArray<SqlWrite>>
) => ({ ok, writes: parts.flat() }) satisfies Indexed;

/** Marks a file as seen and records why it could not be indexed. */
const problem = (
  pass: Pass,
  file: StoredFile,
  message: string,
  line?: number
) =>
  Effect.map(
    Effect.all([
      recordProblem(file.path, message, line),
      markFile(file.path, file.sha, pass.claim.generation)
    ]),
    parts => gather(false, ...parts)
  );

const done = (pass: Pass, file: StoredFile) =>
  Effect.map(
    Effect.all([
      clearProblem(file.path),
      markFile(file.path, file.sha, pass.claim.generation)
    ]),
    parts => gather(true, ...parts)
  );

/** With `before` statements ahead of a problem or a clean result. */
const after = <E, R>(
  before: Effect.Effect<ReadonlyArray<SqlWrite>, never, R>,
  then: Effect.Effect<Indexed, E, R>
) =>
  Effect.map(Effect.all([before, then]), ([first, rest]) =>
    gather(rest.ok, first, rest.writes)
  );

/** Indexes a collection's config; its entries are read again against the new model. */
const indexConfig = Effect.fnUntraced(function* (
  pass: Pass,
  file: StoredFile,
  collection: string
) {
  const stale = yield* staleEntries(collection, file.path);

  if (!COLLECTION_NAME.test(collection))
    return yield* after(
      Effect.map(dropCollection(collection, file.path), drop => [
        ...stale,
        ...drop
      ]),
      problem(
        pass,
        file,
        'Collection folders are named in lowercase, with hyphens between words'
      )
    );

  const model = yield* Effect.result(
    readCollectionConfig(file.path, yield* pass.snapshot.read(file.path))
  );

  if (Result.isFailure(model))
    return yield* after(
      Effect.map(dropCollection(collection, file.path), drop => [
        ...stale,
        ...drop
      ]),
      problem(pass, file, model.failure.message, model.failure.line)
    );

  return yield* after(
    Effect.map(saveCollection(collection, file.path, model.success), save => [
      ...stale,
      ...save
    ]),
    done(pass, file)
  );
});

/** Indexes the site's settings; an invalid file leaves the site with none. */
const indexSite = Effect.fnUntraced(function* (pass: Pass, file: StoredFile) {
  const settings = yield* Effect.result(
    readSiteConfig(file.path, yield* pass.snapshot.read(file.path))
  );

  if (Result.isFailure(settings))
    return yield* after(
      dropSite,
      problem(pass, file, settings.failure.message, settings.failure.line)
    );

  return yield* after(saveSite(file.path, settings.success), done(pass, file));
});

/** A settings file: the site's, or a collection's config. */
const indexSettings = (pass: Pass, file: StoredFile) =>
  file.path === SITE_PATH
    ? indexSite(pass, file)
    : indexConfig(pass, file, configCollection(file.path) ?? '');

const indexEntry = Effect.fnUntraced(function* (pass: Pass, file: StoredFile) {
  const collection = file.path.split('/')[0] ?? '';
  const model = yield* modelOf(collection);
  const drop = dropEntry(file.path);

  if (Option.isNone(model))
    return yield* after(
      drop,
      problem(
        pass,
        file,
        `${collection}/config.ts is missing or invalid, so this entry has no model`
      )
    );

  const entry = yield* Effect.result(
    readEntry(model.value, file.path, yield* pass.snapshot.read(file.path))
  );

  if (Result.isFailure(entry))
    return yield* after(
      drop,
      problem(pass, file, entry.failure.message, entry.failure.line)
    );

  const owner = yield* slugOwner(collection, entry.success.slug, file.path);

  if (Option.isSome(owner))
    return yield* after(
      drop,
      problem(
        pass,
        file,
        `${owner.value} already uses the slug "${entry.success.slug}"`
      )
    );

  return yield* after(
    saveEntry(file.path, file.sha, entry.success, model.value),
    done(pass, file)
  );
});

/** Removes a deleted file from the index. */
const forget = (path: string) => {
  const collection = configCollection(path);
  const drop =
    path === SITE_PATH
      ? dropSite
      : collection === undefined
        ? dropEntry(path)
        : dropCollection(collection, path);

  return Effect.map(
    Effect.all([drop, clearProblem(path), forgetFile(path)]),
    parts => parts.flat()
  );
};

/** Within the size every write path enforces; a store may know it before reading. */
const tooLarge = (file: StoredFile) =>
  file.size !== undefined && file.size > MAX_CONTENT_BYTES;

/** Indexes a file, or takes it out of the index as a problem if it is too large to read. */
const indexWithin = <E, R>(
  pass: Pass,
  file: StoredFile,
  index: Effect.Effect<Indexed, E, R>
) =>
  tooLarge(file)
    ? after(forget(file.path), problem(pass, file, 'This file is over 1 MB'))
    : index;

const changedFiles = (
  files: ReadonlyArray<StoredFile>,
  known: ReadonlyMap<string, string>
) => files.filter(file => known.get(file.path) !== file.sha);

/** Writes one file's changes, if the pass may still write that file. */
const commit = (pass: Pass, path: string, writes: ReadonlyArray<SqlWrite>) =>
  Effect.flatMap(AtomicWrites, atomic =>
    atomic.run(guarded(pass.claim, path, writes))
  );

/** Reads and writes, with the lease held; the caller ends the pass. */
const passWork = Effect.fnUntraced(function* (claim: SyncPass, limit: number) {
  const store = yield* ContentStore;
  const pass: Pass = { claim, snapshot: yield* store.snapshot };
  const files = pass.snapshot.files.filter(file => isContentFile(file.path));
  const present = new Set(files.map(file => file.path));
  const gone = [...(yield* knownFiles).keys()].filter(
    path => !present.has(path)
  );

  for (const path of gone) yield* commit(pass, path, yield* forget(path));

  const configs = changedFiles(files, yield* knownFiles)
    .filter(file => isSettings(file.path))
    .slice(0, limit);
  const results: boolean[] = [];

  for (const file of configs) {
    const indexed = yield* indexWithin(pass, file, indexSettings(pass, file));

    yield* commit(pass, file.path, indexed.writes);
    results.push(indexed.ok);
  }

  const entries = changedFiles(files, yield* knownFiles)
    .filter(file => ENTRY.test(file.path))
    .slice(0, Math.max(0, limit - configs.length));

  for (const file of entries) {
    const indexed = yield* indexWithin(pass, file, indexEntry(pass, file));

    yield* commit(pass, file.path, indexed.writes);
    results.push(indexed.ok);
  }

  return {
    version: pass.snapshot.version,
    indexed: results.length,
    removed: gone.length,
    remaining: changedFiles(files, yield* knownFiles).length,
    problems: results.filter(ok => !ok).length
  };
});

const IDLE = { indexed: 0, removed: 0, remaining: 0, problems: 0 };

type PassResult = Effect.Success<ReturnType<typeof passWork>>;

/** Ends a pass that ran: records where the index stands, and whether more is asked for. */
const finished = (claim: SyncPass, result: PassResult, now: number) =>
  Effect.gen(function* () {
    yield* finishPass(
      claim,
      result.version,
      result.remaining,
      DateTime.formatIso(DateTime.makeUnsafe(now))
    );

    const asked = Option.match(yield* sourceState, {
      onNone: () => false,
      onSome: row => row.requested > row.handled
    });

    return {
      outcome: result.remaining > 0 || asked ? 'more' : 'done',
      indexed: result.indexed,
      removed: result.removed,
      remaining: result.remaining,
      problems: result.problems
    } satisfies SyncReport;
  });

/** One bounded pass. Call again while the outcome is `more` or `superseded`. */
export const syncContent = Effect.fnUntraced(function* (limit = 200) {
  const now = yield* Clock.currentTimeMillis;
  const claimed = yield* claimPass(now);

  if (Option.isNone(claimed))
    return { outcome: 'busy', ...IDLE } satisfies SyncReport;

  const claim = claimed.value;
  const ended = (outcome: SyncOutcome, reason: string | null) =>
    Effect.as(abandonPass(claim, reason), {
      outcome,
      ...IDLE
    } satisfies SyncReport);

  return yield* passWork(claim, limit).pipe(
    Effect.flatMap(result => finished(claim, result, now)),
    Effect.catchTags({
      // A guard refused a batch: a newer fence or publish owns this file now.
      AtomicWriteError: () => ended('superseded', null),
      ContentStoreError: error => ended('failed', error.message)
    })
  );
});

/** Most passes `syncAll` runs before it reports where it stopped. */
const MAX_PASSES = 1_000;

/** Runs passes until the index has caught up, someone else holds the lease, or the source fails. */
export const syncAll = Effect.fnUntraced(function* (limit = 200) {
  let total: SyncReport = { outcome: 'done', ...IDLE };

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const report = yield* syncContent(limit);

    total = {
      outcome: report.outcome,
      indexed: total.indexed + report.indexed,
      removed: total.removed + report.removed,
      remaining: report.remaining,
      problems: total.problems + report.problems
    };

    if (!['more', 'superseded'].includes(report.outcome)) return total;
  }

  return total;
});
