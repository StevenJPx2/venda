// Publishing a working copy: its file, the file's revision, its index rows
// and the clean copy are one atomic write (files.ts). The write is refused,
// as a whole, if the file moved from the copy's base (Conflict) or someone
// saved the copy meanwhile (EditedElsewhere).
import type { Named } from '@gdp-ts/core';
import {
  ContentTooLarge,
  EditedElsewhere,
  InvalidContent,
  MAX_CONTENT_BYTES,
  type EntryRef,
  type UserId
} from '@venda/contract';
import {
  checkEntryData,
  readEntry,
  textSha,
  writeEntry,
  type CollectionModel
} from '@venda/content';
import { Effect, Result } from 'effect';
import type { CanPublishEntry } from '../auth/proofs/can-publish-entry';
import { authorOf } from './author';
import { guard, writeFiles } from './files';
import { lifecycleRefusal, modelGuard } from './lifecycle-state';
import { lifecycleModel } from './lifecycle-file';

import { dataFrom, openWork, presentWork, type WorkRow } from './work-read';

const invalid = (error: { message: string }) =>
  new InvalidContent({ message: error.message });

/** The copy as the file it publishes: canonical, and read back as the index will read it. */
const fileOf = (row: WorkRow, model: CollectionModel) =>
  Effect.gen(function* () {
    const data = dataFrom(row.dataJson);
    const checked = checkEntryData(model, data, row.publishedAt);

    if (Result.isFailure(checked))
      return yield* new InvalidContent({ message: checked.failure });

    const text = writeEntry(model, {
      collection: row.collection,
      slug: row.slug,
      draft: false,
      publishedAt: row.publishedAt ?? undefined,
      data,
      extra: dataFrom(row.extraJson)
    });

    if (new TextEncoder().encode(text).byteLength > MAX_CONTENT_BYTES)
      return yield* new ContentTooLarge();

    const entry = yield* readEntry(model, row.path, text).pipe(
      Effect.mapError(invalid)
    );

    return { text, entry };
  });

export const publishWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  revision: number,
  _proof: CanPublishEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* openWork(entry.value);

    if (row.revision !== revision)
      return yield* new EditedElsewhere({ revision: row.revision });

    if (!row.dirty)
      return yield* new InvalidContent({
        message: 'There are no changes to publish'
      });

    const model = yield* lifecycleModel(entry.value);
    const file = yield* fileOf(row, model.model);
    const sha = yield* Effect.promise(() => textSha(file.text));
    const where = 'collection = ? AND slug = ? AND revision = ?';
    const at = [row.collection, row.slug, row.revision];

    yield* writeFiles(
      [{ path: row.path, text: file.text, baseSha: row.baseSha }],
      {
        author: yield* authorOf(user.value),
        message: `Publish ${row.collection}/${row.slug}`,
        mode: 'strict',
        guards: [
          guard(`EXISTS (SELECT 1 FROM content_work WHERE ${where})`, at),
          modelGuard(model)
        ],
        extra: [
          {
            sql: `UPDATE content_work SET base_sha = ?, data_json = ?, published_at = ?,
            revision = revision + 1, dirty = 0 WHERE ${where}`,
            params: [
              sha,
              JSON.stringify(file.entry.data),
              file.entry.publishedAt ?? null,
              ...at
            ]
          }
        ]
      }
    ).pipe(
      Effect.catchTag('GuardRefused', error =>
        lifecycleRefusal(entry.value, row.revision, error, model)
      )
    );

    return yield* presentWork(yield* openWork(entry.value), true);
  });
