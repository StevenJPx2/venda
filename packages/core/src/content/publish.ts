// A durable, frozen intent fences saves until its file and index are committed.
// Retrying a revision resumes that same intent after an uncertain store write.
import type { Named } from '@gdp-ts/core';
import {
  ContentReadOnly,
  EditedElsewhere,
  InvalidContent,
  type EntryRef,
  type UserId
} from '@venda/contract';
import { MAX_CONTENT_BYTES, ContentTooLarge } from '@venda/contract';
import {
  readEntry,
  writeEntry,
  checkEntryData,
  modelFrom,
  type Entry,
  type CollectionModel
} from '@venda/content';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Result } from 'effect';
import type { CanPublishEntry } from '../auth/proofs/can-publish-entry';
import { AtomicWrites, Database, type SqlWrite } from '../database';
import { contentWork } from './schema';
import { ContentStore, ContentStoreError, gitBlobSha } from './services';
import { sortKey } from './order';
import {
  dataFrom,
  modelFor,
  openWork,
  presentWork,
  workKey,
  type WorkRow
} from './work-read';
import { stampWrite } from './source-state';
import { failedUpdate, idleRevision } from './work';
import { commitAuthor } from './commit-author';

const invalid = (error: { message: string }) =>
  new InvalidContent({ message: error.message });

const sourceOf = (row: WorkRow, model: CollectionModel) =>
  Effect.gen(function* () {
    const data = dataFrom(row.dataJson);
    const checked = checkEntryData(model, data, row.publishedAt);

    if (Result.isFailure(checked))
      return yield* new InvalidContent({ message: checked.failure });

    const content = writeEntry(model, {
      collection: row.collection,
      slug: row.slug,
      draft: false,
      publishedAt: row.publishedAt ?? undefined,
      data,
      extra: dataFrom(row.extraJson)
    });

    yield* readEntry(model, row.path, content).pipe(Effect.mapError(invalid));

    return content;
  });

const claimPublish = (ref: EntryRef, revision: number, userId: UserId) =>
  Effect.gen(function* () {
    const row = yield* openWork(ref);

    if (row.revision !== revision)
      return yield* new EditedElsewhere({ revision: row.revision });
    if (row.publishText !== null) return row;
    if (!row.dirty)
      return yield* new InvalidContent({
        message: 'There are no changes to publish'
      });

    const model = yield* modelFor(ref);
    const text = yield* sourceOf(row, model);
    const bytes = new TextEncoder().encode(text);

    if (bytes.byteLength > MAX_CONTENT_BYTES)
      return yield* new ContentTooLarge();

    const sha = yield* Effect.promise(() => gitBlobSha(bytes));
    const author = yield* commitAuthor(userId);
    const db = yield* Database;
    const [claimed] = yield* db
      .update(contentWork)
      .set({
        publishText: text,
        publishSha: sha,
        publishModelJson: JSON.stringify(model),
        publishAuthor: author
      })
      .where(idleRevision(ref, revision))
      .returning();

    if (!claimed) return yield* failedUpdate(ref);

    return claimed;
  });

const guard = `collection = ? AND slug = ? AND revision = ? AND publish_sha = ? AND publish_text IS NOT NULL`;
const guardParams = (row: WorkRow) => [
  row.collection,
  row.slug,
  row.revision,
  row.publishSha
];

/** Each write is conditional on the intent; the final write consumes it. */
function guardedUpsert(
  table: string,
  columns: ReadonlyArray<string>,
  values: ReadonlyArray<unknown>,
  conflict: string,
  row: WorkRow
): SqlWrite {
  return {
    sql: `INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map(() => '?').join(',')}
      WHERE EXISTS (SELECT 1 FROM content_work WHERE ${guard})
      ON CONFLICT(${conflict}) DO UPDATE SET ${columns.map(column => `${column}=excluded.${column}`).join(',')}`,
    params: [...values, ...guardParams(row)]
  };
}

function indexWrite(
  row: WorkRow,
  model: CollectionModel,
  entry: Entry
): SqlWrite {
  const publishedAt =
    entry.publishedAt === undefined
      ? null
      : Option.getOrNull(
          Option.map(DateTime.make(entry.publishedAt), DateTime.formatIso)
        );
  const dataJson = JSON.stringify(entry.data);

  return guardedUpsert(
    'content_entries',
    [
      'collection',
      'slug',
      'path',
      'draft',
      'published_at',
      'data_json',
      'sha',
      'sort_key'
    ],
    [
      row.collection,
      row.slug,
      row.path,
      0,
      publishedAt,
      dataJson,
      row.publishSha,
      sortKey(model, entry, publishedAt)
    ],
    'path',
    row
  );
}

const indexChanges = (
  row: WorkRow,
  model: CollectionModel,
  parsed: Result.Result<Entry, string>
): SqlWrite[] =>
  Result.match(parsed, {
    onSuccess: entry => [
      indexWrite(row, model, entry),
      {
        sql: `DELETE FROM content_problems WHERE path = ? AND EXISTS (SELECT 1 FROM content_work WHERE ${guard})`,
        params: [row.path, ...guardParams(row)]
      }
    ],
    onFailure: message => [
      {
        sql: `DELETE FROM content_entries WHERE path = ? AND EXISTS (SELECT 1 FROM content_work WHERE ${guard})`,
        params: [row.path, ...guardParams(row)]
      },
      guardedUpsert(
        'content_problems',
        ['path', 'message', 'line'],
        [row.path, message, null],
        'path',
        row
      )
    ]
  });

function finalizeWrites(
  row: WorkRow,
  entry: Entry,
  model: CollectionModel,
  current: Result.Result<Entry, string>
): SqlWrite[] {
  const publishedAt = entry.publishedAt ?? null;
  const dataJson = JSON.stringify(entry.data);
  // The file carries a new generation, so a sync pass that began before this
  // publish never writes its older read over it.
  const file = stampWrite(row.path, row.publishSha ?? '', {
    sql: `EXISTS (SELECT 1 FROM content_work WHERE ${guard})`,
    params: guardParams(row)
  });

  return [
    ...indexChanges(row, model, current),
    ...file,
    {
      sql: `UPDATE content_work SET base_sha = publish_sha, data_json = ?, published_at = ?,
       revision = revision + 1, dirty = 0, publish_text = NULL, publish_sha = NULL, publish_model_json = NULL, publish_author = NULL WHERE ${guard}`,
      params: [dataJson, publishedAt, ...guardParams(row)]
    }
  ];
}

const releaseConflict = (row: WorkRow) =>
  Effect.gen(function* () {
    const db = yield* Database;

    yield* db
      .update(contentWork)
      .set({
        publishText: null,
        publishSha: null,
        publishModelJson: null,
        publishAuthor: null,
        revision: row.revision + 1
      })
      .where(
        and(
          workKey(row),
          eq(contentWork.revision, row.revision),
          eq(contentWork.publishSha, row.publishSha ?? '')
        )
      );
  });

export const publishWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  revision: number,
  _proof: CanPublishEntry<U, E>
) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;

    if (!store.writable) return yield* new ContentReadOnly();

    const row = yield* claimPublish(entry.value, revision, user.value);

    if (
      row.publishText === null ||
      row.publishSha === null ||
      row.publishModelJson === null
    )
      return yield* Effect.die(new Error('Publish intent is incomplete'));

    const committed = yield* store
      .commit({
        path: row.path,
        baseSha: row.baseSha,
        content: row.publishText,
        sha: row.publishSha,
        message: `Publish ${row.collection}/${row.slug}`,
        // An intent frozen before attribution existed is credited to Venda.
        author: row.publishAuthor ?? 'Venda'
      })
      .pipe(
        Effect.catchTag('Conflict', error =>
          Effect.andThen(releaseConflict(row), Effect.fail(error))
        )
      );

    if (committed.sha !== row.publishSha)
      return yield* new ContentStoreError({
        message:
          'Content store returned a different SHA from the publish intent'
      });

    const model = Result.getOrThrow(modelFrom(dataFrom(row.publishModelJson)));
    const parsed = yield* readEntry(model, row.path, row.publishText).pipe(
      Effect.mapError(invalid)
    );
    const atomic = yield* AtomicWrites;
    const currentModel = yield* modelFor(entry.value);
    const current = yield* Effect.result(
      readEntry(currentModel, row.path, row.publishText).pipe(
        Effect.mapError(error => error.message)
      )
    );

    yield* atomic.run(finalizeWrites(row, parsed, currentModel, current));

    return yield* presentWork(yield* openWork(entry.value), true);
  });
