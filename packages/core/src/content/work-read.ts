// Operational entry records persist even when there is no pending edit. This
// preserves both ownership and monotonic revisions across publish/discard.
import {
  CollectionNotFound,
  EntryNotFound,
  InvalidContent,
  WorkingCopy,
  UserId,
  type EntryRef
} from '@venda/contract';
import { readEntry } from '@venda/content';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';
import { Database } from '../database';
import { contentEntries, contentWork, contentProblems } from './schema';
import { ContentStore, gitBlobSha } from './services';
import { modelOf } from './tables';

export type WorkRow = typeof contentWork.$inferSelect;

export const dataFrom = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

const userIdFrom = Schema.decodeUnknownSync(Schema.NullOr(UserId));

export const workKey = (ref: Pick<EntryRef, 'collection' | 'slug'>) =>
  and(
    eq(contentWork.collection, ref.collection),
    eq(contentWork.slug, ref.slug)
  );

export const modelFor = (ref: EntryRef) =>
  Effect.gen(function* () {
    const model = yield* modelOf(ref.collection);

    if (Option.isNone(model))
      return yield* new CollectionNotFound({ collection: ref.collection });

    return model.value;
  });

const currentSha = (path: string) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const files = yield* store.list;

    return files.find(file => file.path === path)?.sha ?? null;
  });

export const snapshot = (ref: EntryRef, path: string) =>
  Effect.gen(function* () {
    const model = yield* modelFor(ref);
    const store = yield* ContentStore;

    if ((yield* currentSha(path)) === null)
      return yield* new EntryNotFound(ref);

    const text = yield* store.read(path);
    const entry = yield* readEntry(model, path, text).pipe(
      Effect.mapError(error => new InvalidContent({ message: error.message }))
    );
    const sha = yield* Effect.promise(() =>
      gitBlobSha(new TextEncoder().encode(text))
    );

    return {
      baseSha: sha,
      dataJson: JSON.stringify(entry.data),
      extraJson: JSON.stringify(entry.extra),
      publishedAt: entry.publishedAt ?? null
    };
  });

const workOf = (ref: EntryRef) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db.select().from(contentWork).where(workKey(ref));

    return row;
  });

/** Initializes an editable file's operational record without marking it dirty. */
export const openWork = (ref: EntryRef) =>
  Effect.gen(function* () {
    yield* modelFor(ref);
    const known = yield* workOf(ref);

    if (known) return known;

    const db = yield* Database;
    const [indexed] = yield* db
      .select({ path: contentEntries.path })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.collection, ref.collection),
          eq(contentEntries.slug, ref.slug)
        )
      );

    if (!indexed) return yield* new EntryNotFound(ref);

    const file = yield* snapshot(ref, indexed.path);

    yield* db
      .insert(contentWork)
      .values({ ...ref, path: indexed.path, ...file })
      .onConflictDoNothing();
    const row = yield* workOf(ref);

    if (!row) return yield* Effect.die(new Error('Working record disappeared'));

    return row;
  });

/** A clean record follows outside changes, but every refresh raises its revision. */
export const freshWork = (ref: EntryRef) =>
  Effect.gen(function* () {
    const row = yield* openWork(ref);
    const sha = yield* currentSha(row.path);

    if (
      row.dirty ||
      row.publishText !== null ||
      sha === row.baseSha ||
      sha === null
    )
      return row;

    const file = yield* snapshot(ref, row.path);
    const db = yield* Database;
    const [updated] = yield* db
      .update(contentWork)
      .set({ ...file, revision: row.revision + 1 })
      .where(
        and(
          workKey(ref),
          eq(contentWork.revision, row.revision),
          eq(contentWork.dirty, false),
          isNull(contentWork.publishText)
        )
      )
      .returning();

    return updated ?? (yield* openWork(ref));
  });

export const presentWork = (row: WorkRow, canPublish: boolean) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const sha = yield* currentSha(row.path);
    const db = yield* Database;
    const [problem] = yield* db
      .select({ message: contentProblems.message })
      .from(contentProblems)
      .where(eq(contentProblems.path, row.path));

    return new WorkingCopy({
      collection: row.collection,
      slug: row.slug,
      revision: row.revision,
      baseSha: row.baseSha,
      data: dataFrom(row.dataJson),
      publishedAt: row.publishedAt,
      dirty: row.dirty,
      publishing: row.publishText !== null,
      changedOutside:
        sha !== row.baseSha &&
        (row.publishSha === null || sha !== row.publishSha),
      currentSha: sha,
      ownerId: userIdFrom(row.ownerId),
      updatedBy: userIdFrom(row.updatedBy),
      updatedAt: row.updatedAt,
      canPublish,
      writable: store.writable,
      indexProblem: problem?.message ?? null
    });
  });
