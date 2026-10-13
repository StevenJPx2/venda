// The content files as a whole: listing and reading them, writing a set of
// them at once (the files API and the CLI), and import and export between D1
// and a content folder.
import type { Named } from '@gdp-ts/core';
import type { UserId } from '@venda/contract';
import { asc } from 'drizzle-orm';
import { Effect, Option } from 'effect';
import type { CanEditFiles } from '../auth/proofs/can-edit-files';
import type { IsAdministrator } from '../auth/proofs/is-administrator';
import { Database } from '../database';
import { authorOf } from './author';
import { currentShas, fileAt, writeFiles, type FileChange } from './files';
import { contentFiles } from './schema';
import { textSha } from './sha';

/** Every file's path, SHA and size, A to Z. */
export const listFiles = <A>(_proof: CanEditFiles<A>) =>
  Effect.flatMap(Database, db =>
    db
      .select({
        path: contentFiles.path,
        sha: contentFiles.sha,
        size: contentFiles.size,
        updatedAt: contentFiles.updatedAt
      })
      .from(contentFiles)
      .orderBy(asc(contentFiles.path))
  );

/** One file's text and SHA, if it exists. */
export const readFile = <A>(path: string, _proof: CanEditFiles<A>) =>
  Effect.map(fileAt(path), Option.getOrNull);

/**
 * Writes a set of files atomically, each from the SHA it was read at:
 * all of them, or none and `Conflict` naming the first that moved.
 */
export const pushFiles = <A>(
  user: Named<A, UserId>,
  message: string,
  changes: ReadonlyArray<FileChange>,
  _proof: CanEditFiles<A>
) =>
  Effect.gen(function* () {
    return yield* writeFiles(changes, {
      author: yield* authorOf(user.value),
      message,
      mode: 'strict'
    });
  });

/**
 * Brings a folder's files in, over whatever is there: files the index cannot
 * read are kept and listed as problems, so nothing in the folder is lost.
 * Unchanged files are skipped, so importing again adds no revisions.
 */
export const importFiles = <A>(
  user: Named<A, UserId>,
  files: ReadonlyArray<{ readonly path: string; readonly text: string }>,
  _admin: IsAdministrator<A>
) =>
  Effect.gen(function* () {
    const now = yield* currentShas(files.map(file => file.path));
    const changed = yield* Effect.filter(files, file =>
      Effect.promise(
        async () => now.get(file.path) !== (await textSha(file.text))
      )
    );

    yield* writeFiles(
      changed.map(file => ({
        path: file.path,
        text: file.text,
        baseSha: now.get(file.path) ?? null
      })),
      {
        author: yield* authorOf(user.value),
        message: 'Import',
        mode: 'keep'
      }
    );

    return {
      imported: changed.length,
      unchanged: files.length - changed.length
    };
  });
