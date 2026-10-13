import { Conflict, InvalidContent, type EntryRef } from '@venda/contract';
import {
  readCollectionConfig,
  readEntry,
  textSha,
  writeEntry,
  type CollectionModel
} from '@venda/content';
import { desc, eq, and } from 'drizzle-orm';
import { Effect, Option } from 'effect';
import { Database } from '../database';
import { fileAt } from './files';
import { contentRevisions } from './schema';
import type { WorkRow } from './work-read';
import type { FileVersion } from './lifecycle-state';

export interface LifecycleModel extends FileVersion {
  readonly model: CollectionModel;
}

const invalid = (error: { message: string }) =>
  new InvalidContent({ message: error.message });

/** Read the model's file and SHA together; guard that SHA when committing. */
export const lifecycleModel = (ref: EntryRef) =>
  Effect.gen(function* () {
    const path = `${ref.collection}/config.ts`;
    const file = Option.getOrNull(yield* fileAt(path));

    if (!file)
      return yield* new InvalidContent({ message: `${path} is missing` });

    return {
      path,
      sha: file.sha,
      model: yield* readCollectionConfig(path, file.text).pipe(
        Effect.mapError(invalid)
      )
    };
  });

export const currentEntryFile = (row: WorkRow, expectedSha: string) =>
  Effect.gen(function* () {
    const file = Option.getOrNull(yield* fileAt(row.path));

    if (file === null || file.sha !== expectedSha)
      return yield* new Conflict({ path: row.path, sha: file?.sha ?? null });

    return file;
  });

export const trashedFile = (row: WorkRow) =>
  Effect.gen(function* () {
    if (row.trashSha === null)
      return yield* Effect.die(new Error('A trashed entry has no file SHA'));

    const db = yield* Database;
    const [file] = yield* db
      .select({ text: contentRevisions.text })
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.path, row.path),
          eq(contentRevisions.sha, row.trashSha)
        )
      )
      .orderBy(desc(contentRevisions.id))
      .limit(1);

    if (file?.text === null || file?.text === undefined)
      return yield* Effect.die(
        new Error('A trashed entry has no saved file revision')
      );

    return file.text;
  });

/** Change only public state, keeping all modeled and unknown frontmatter fields. */
export const fileWithState = (
  row: WorkRow,
  model: LifecycleModel,
  text: string,
  draft: boolean
) =>
  Effect.gen(function* () {
    const entry = yield* readEntry(model.model, row.path, text).pipe(
      Effect.mapError(invalid)
    );
    const next = writeEntry(model.model, { ...entry, draft });
    const canonical = yield* readEntry(model.model, row.path, next).pipe(
      Effect.mapError(invalid)
    );

    return {
      text: next,
      sha: yield* Effect.promise(() => textSha(next)),
      wasDraft: entry.draft,
      entry: canonical
    };
  });
