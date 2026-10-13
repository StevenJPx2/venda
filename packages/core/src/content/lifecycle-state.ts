import {
  Conflict,
  EditedElsewhere,
  EntryNotFound,
  EntryNotTrashed,
  EntryTrashed,
  type EntryRef
} from '@venda/contract';
import { Effect, Option } from 'effect';
import { AtomicWriteError } from '../database';
import { fileAt, guard, type GuardRefused } from './files';
import { openWork, workOf, type WorkRow } from './work-read';

export interface FileVersion {
  readonly path: string;
  readonly sha: string;
}

/** Lifecycle actions operate on precisely the working record the user saw. */
export const lifecycleRow = (
  ref: EntryRef,
  revision: number,
  status: WorkRow['status']
) =>
  Effect.gen(function* () {
    const row = (yield* workOf(ref)) ?? (yield* openWork(ref));

    if (row.revision !== revision)
      return yield* new EditedElsewhere({ revision: row.revision });
    if (row.status !== status)
      return yield* row.status === 'trashed'
        ? new EntryTrashed(ref)
        : new EntryNotTrashed(ref);

    return row;
  });

export const workGuard = (row: WorkRow) =>
  guard(
    `EXISTS (SELECT 1 FROM content_work
    WHERE collection = ? AND slug = ? AND revision = ? AND status = ?)`,
    [row.collection, row.slug, row.revision, row.status]
  );

export const modelGuard = (file: FileVersion) =>
  guard('(SELECT sha FROM content_files WHERE path = ?) IS ?', [
    file.path,
    file.sha
  ]);

/** Fails with Conflict unless `path` is still at `sha` (null: still absent). */
const fileStill = (path: string, sha: string | null) =>
  Effect.gen(function* () {
    const current = Option.getOrNull(yield* fileAt(path))?.sha ?? null;

    if (current !== sha) return yield* new Conflict({ path, sha: current });
  });

/**
 * Why a lifecycle batch's own guards refused it: the working record moved on,
 * the model changed, or the restored path's twin appeared. With none of those,
 * the database failed.
 */
export const lifecycleRefusal = (
  ref: EntryRef,
  expectedRevision: number,
  error: GuardRefused,
  model?: FileVersion,
  otherPath?: string
) =>
  Effect.gen(function* () {
    const row = yield* workOf(ref);

    if (!row) return yield* new EntryNotFound(ref);
    if (row.revision !== expectedRevision)
      return yield* new EditedElsewhere({ revision: row.revision });

    if (model) yield* fileStill(model.path, model.sha);
    if (otherPath) yield* fileStill(otherPath, null);

    return yield* new AtomicWriteError({ cause: error.cause });
  });
