// Public state and trash are independent of saved working-copy edits.
// Every transition changes the file, index and working record in one batch.
import type { Named } from '@gdp-ts/core';
import {
  Conflict,
  InvalidContent,
  type EntryRef,
  type UserId
} from '@venda/contract';
import { DateTime, Effect } from 'effect';
import { checkEntryData, type Entry } from '@venda/content';
import { Result } from 'effect';
import type { CanPublishEntry } from '../auth/proofs/can-publish-entry';
import { authorOf } from './author';
import { guard, writeFiles } from './files';
import {
  currentEntryFile,
  fileWithState,
  lifecycleModel,
  trashedFile
} from './lifecycle-file';
import {
  lifecycleRefusal,
  lifecycleRow,
  modelGuard,
  workGuard
} from './lifecycle-state';
import { presentTrash } from './trash-read';
import {
  currentSha,
  dataFrom,
  openWork,
  presentWork,
  type WorkRow
} from './work-read';
import type { SqlWrite } from '../database';

export interface LifecycleInput {
  readonly revision: number;
  readonly sha: string;
}

/** Adopt the new base only when the saved copy was based on the file we changed. */
const followFile = (
  row: WorkRow,
  oldSha: string,
  newSha: string,
  entry: Entry
): SqlWrite => ({
  sql: `UPDATE content_work SET base_sha = CASE WHEN dirty = 0 OR base_sha = ? THEN ? ELSE base_sha END,
    data_json = CASE WHEN dirty = 0 THEN ? ELSE data_json END,
    extra_json = CASE WHEN dirty = 0 THEN ? ELSE extra_json END,
    published_at = CASE WHEN dirty = 0 THEN ? ELSE published_at END,
    revision = revision + 1 WHERE collection = ? AND slug = ? AND revision = ?`,
  params: [
    oldSha,
    newSha,
    JSON.stringify(entry.data),
    JSON.stringify(entry.extra),
    entry.publishedAt ?? null,
    row.collection,
    row.slug,
    row.revision
  ]
});

export const setEntryVisibility = <U, E>(
  user: Named<U, UserId>,
  ref: Named<E, EntryRef>,
  input: LifecycleInput,
  visibility: 'draft' | 'published',
  _proof: CanPublishEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* lifecycleRow(ref.value, input.revision, 'active');
    const current = yield* currentEntryFile(row, input.sha);
    const model = yield* lifecycleModel(ref.value);
    const file = yield* fileWithState(
      row,
      model,
      current.text,
      visibility === 'draft'
    );

    if (file.wasDraft === (visibility === 'draft'))
      return yield* presentWork(row, true);

    yield* writeFiles(
      [{ path: row.path, text: file.text, baseSha: current.sha }],
      {
        author: yield* authorOf(user.value),
        message: `${visibility === 'draft' ? 'Unpublish' : 'Republish'} ${row.collection}/${row.slug}`,
        mode: 'strict',
        guards: [workGuard(row), modelGuard(model)],
        extra: [followFile(row, current.sha, file.sha, file.entry)]
      }
    ).pipe(
      Effect.catchTag('GuardRefused', error =>
        lifecycleRefusal(ref.value, row.revision, error, model)
      )
    );

    return yield* presentWork(yield* openWork(ref.value), true);
  });

export const trashEntry = <U, E>(
  user: Named<U, UserId>,
  ref: Named<E, EntryRef>,
  input: LifecycleInput,
  _proof: CanPublishEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* lifecycleRow(ref.value, input.revision, 'active');
    const file = yield* currentEntryFile(row, input.sha);
    const at = DateTime.formatIso(yield* DateTime.now);

    yield* writeFiles([{ path: row.path, text: null, baseSha: file.sha }], {
      author: yield* authorOf(user.value),
      message: `Trash ${row.collection}/${row.slug}`,
      mode: 'keep',
      guards: [workGuard(row)],
      extra: [
        {
          sql: `UPDATE content_work SET status = 'trashed', trash_sha = ?, trashed_at = ?,
          trashed_by = ?, revision = revision + 1
          WHERE collection = ? AND slug = ? AND revision = ?`,
          params: [
            file.sha,
            at,
            user.value,
            row.collection,
            row.slug,
            row.revision
          ]
        }
      ]
    }).pipe(
      Effect.catchTag('GuardRefused', error =>
        lifecycleRefusal(ref.value, row.revision, error)
      )
    );

    return yield* presentTrash(
      {
        ...row,
        status: 'trashed',
        trashSha: file.sha,
        trashedAt: at,
        trashedBy: user.value,
        revision: row.revision + 1
      },
      true
    );
  });

const otherExtension = (path: string) =>
  path.endsWith('.mdx') ? path.slice(0, -1) : `${path}x`;

export const restoreEntry = <U, E>(
  user: Named<U, UserId>,
  ref: Named<E, EntryRef>,
  revision: number,
  _proof: CanPublishEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* lifecycleRow(ref.value, revision, 'trashed');
    const model = yield* lifecycleModel(ref.value);
    const file = yield* fileWithState(
      row,
      model,
      yield* trashedFile(row),
      true
    );
    const saved = checkEntryData(
      model.model,
      dataFrom(row.dataJson),
      row.publishedAt
    );

    if (row.dirty && Result.isFailure(saved))
      return yield* new InvalidContent({
        message: `Saved changes do not fit the current model: ${saved.failure}`
      });

    const other = otherExtension(row.path);
    const occupied = yield* currentSha(other);

    if (occupied !== null)
      return yield* new Conflict({ path: other, sha: occupied });
    if (row.trashSha === null)
      return yield* new InvalidContent({
        message: 'The trashed file has no saved version'
      });

    yield* writeFiles([{ path: row.path, text: file.text, baseSha: null }], {
      author: yield* authorOf(user.value),
      message: `Restore ${row.collection}/${row.slug} as draft`,
      mode: 'strict',
      revival: { path: row.path, revision },
      guards: [
        workGuard(row),
        modelGuard(model),
        guard('NOT EXISTS (SELECT 1 FROM content_files WHERE path = ?)', [
          other
        ])
      ],
      extra: [
        followFile(row, row.trashSha, file.sha, file.entry),
        {
          sql: `UPDATE content_work SET status = 'active', trash_sha = NULL,
          trashed_at = NULL, trashed_by = NULL WHERE collection = ? AND slug = ?`,
          params: [row.collection, row.slug]
        }
      ]
    }).pipe(
      Effect.catchTag('GuardRefused', error =>
        lifecycleRefusal(ref.value, revision, error, model, other)
      )
    );

    return yield* presentWork(yield* openWork(ref.value), true);
  });
