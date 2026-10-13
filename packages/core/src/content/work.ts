import type { Named } from '@gdp-ts/core';
import {
  EditedElsewhere,
  InvalidContent,
  Conflict,
  type EntryRef,
  type UserId
} from '@venda/contract';
import { MAX_CONTENT_BYTES, ContentTooLarge } from '@venda/contract';
import { checkEntryData } from '@venda/content';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Result, Schema } from 'effect';
import { canPublishEntry } from '../auth/proofs/can-publish-entry';
import type { CanEditEntry } from '../auth/proofs/can-edit-entry';
import type { CanAssignOwner } from '../auth/proofs/can-assign-owner';
import { Database } from '../database';
import { users } from '../auth/schema';
import { contentWork } from './schema';
import {
  currentSha,
  freshWork,
  modelFor,
  openWork,
  presentWork,
  snapshot,
  workKey,
  type WorkRow
} from './work-read';

export interface SaveInput {
  readonly revision: number;
  readonly data: Readonly<Record<string, Schema.Json>>;
  readonly publishedAt: string | null;
}

const withinLimit = (text: string) =>
  new TextEncoder().encode(text).byteLength <= MAX_CONTENT_BYTES;

const revisionIs = (row: WorkRow, expected: number) =>
  row.revision === expected
    ? Effect.void
    : Effect.fail(new EditedElsewhere({ revision: row.revision }));

const idleRevision = (ref: EntryRef, revision: number) =>
  and(
    workKey(ref),
    eq(contentWork.revision, revision),
    eq(contentWork.status, 'active')
  );

const failedUpdate = (ref: EntryRef) =>
  Effect.flatMap(openWork(ref), row =>
    Effect.fail(new EditedElsewhere({ revision: row.revision }))
  );

const touched = <U>(user: Named<U, UserId>, revision: number) =>
  Effect.map(DateTime.now, now => ({
    updatedAt: DateTime.formatIso(now),
    updatedBy: user.value,
    revision: revision + 1
  }));

export const getWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  _proof: CanEditEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* freshWork(entry.value);
    const publish = yield* Effect.result(canPublishEntry(user, entry));

    return yield* presentWork(row, Result.isSuccess(publish));
  });

export const saveWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  input: SaveInput,
  proof: CanEditEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* openWork(entry.value);

    yield* revisionIs(row, input.revision);

    if (!withinLimit(JSON.stringify(input)))
      return yield* new ContentTooLarge();

    const model = yield* modelFor(entry.value);
    const checked = checkEntryData(model, input.data, input.publishedAt);

    if (Result.isFailure(checked))
      return yield* new InvalidContent({ message: checked.failure });

    const db = yield* Database;
    const [saved] = yield* db
      .update(contentWork)
      .set({
        ...(yield* touched(user, row.revision)),
        dirty: true,
        dataJson: JSON.stringify(input.data),
        publishedAt: input.publishedAt
      })
      .where(idleRevision(entry.value, row.revision))
      .returning();

    if (!saved) return yield* failedUpdate(entry.value);

    return yield* getWorkingCopy(user, entry, proof);
  });

export const discardWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  revision: number,
  proof: CanEditEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* openWork(entry.value);

    yield* revisionIs(row, revision);

    const db = yield* Database;

    // No file to go back to: hide the copy but retain its revision. Recreating
    // the slug must not make a stale tab's revision valid again.
    if (row.baseSha === null || (yield* currentSha(row.path)) === null) {
      const [gone] = yield* db
        .update(contentWork)
        .set({
          baseSha: null,
          dirty: false,
          ownerId: null,
          dataJson: '{}',
          extraJson: '{}',
          publishedAt: null,
          ...(yield* touched(user, revision))
        })
        .where(idleRevision(entry.value, revision))
        .returning();

      return gone ? null : yield* failedUpdate(entry.value);
    }

    const file = yield* snapshot(entry.value, row.path);
    const [saved] = yield* db
      .update(contentWork)
      .set({
        ...file,
        ...(yield* touched(user, revision)),
        dirty: false
      })
      .where(idleRevision(entry.value, revision))
      .returning();

    if (!saved) return yield* failedUpdate(entry.value);

    return yield* getWorkingCopy(user, entry, proof);
  });

/** Explicitly acknowledges the exact outside file the person chose to replace. */
export const rebaseWorkingCopy = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  revision: number,
  sha: string,
  proof: CanEditEntry<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* openWork(entry.value);

    yield* revisionIs(row, revision);

    const file = yield* snapshot(entry.value, row.path);

    if (file.baseSha !== sha)
      return yield* new Conflict({ path: row.path, sha: file.baseSha });

    const db = yield* Database;
    const [saved] = yield* db
      .update(contentWork)
      .set({
        baseSha: sha,
        extraJson: file.extraJson,
        ...(yield* touched(user, revision))
      })
      .where(idleRevision(entry.value, revision))
      .returning();

    if (!saved) return yield* failedUpdate(entry.value);

    return yield* getWorkingCopy(user, entry, proof);
  });

export const assignEntryOwner = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>,
  revision: number,
  ownerId: UserId | null,
  _proof: CanAssignOwner<U, E>
) =>
  Effect.gen(function* () {
    const row = yield* openWork(entry.value);

    yield* revisionIs(row, revision);

    const db = yield* Database;

    if (ownerId !== null) {
      const [owner] = yield* db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, ownerId), eq(users.status, 'active')));

      if (!owner)
        return yield* new InvalidContent({
          message: 'The owner must be an active person'
        });
    }

    const [saved] = yield* db
      .update(contentWork)
      .set({ ownerId, ...(yield* touched(user, revision)) })
      .where(idleRevision(entry.value, revision))
      .returning();

    if (!saved) return yield* failedUpdate(entry.value);

    const publish = yield* Effect.result(canPublishEntry(user, entry));

    return yield* presentWork(saved, Result.isSuccess(publish));
  });
