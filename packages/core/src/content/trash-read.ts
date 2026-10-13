import { name, type Named } from '@gdp-ts/core';
import { EntryRef, TrashedEntry, TrashPage, UserId } from '@venda/contract';
import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import { Effect, Option, Predicate, Result, Schema } from 'effect';
import { canPublishEntry } from '../auth/proofs/can-publish-entry';
import type { CanBrowseContent } from '../auth/proofs/can-browse-content';
import { Database } from '../database';
import { PAGE_SIZE } from './page-cursor';
import { contentWork } from './schema';
import { modelOf } from './tables';
import { dataFrom, type WorkRow } from './work-read';

const Cursor = Schema.fromJsonString(
  Schema.Struct({ at: Schema.String, path: Schema.String })
);
const decodeCursor = Schema.decodeUnknownOption(Cursor);
const encodeCursor = Schema.encodeSync(Cursor);
const decodeRef = Schema.decodeUnknownSync(EntryRef);
const decodeUser = Schema.decodeUnknownSync(Schema.NullOr(UserId));

export const presentTrash = (row: WorkRow, canRestore: boolean) =>
  Effect.gen(function* () {
    if (row.trashedAt === null)
      return yield* Effect.die(
        new Error('A trashed entry has no deletion time')
      );

    const model = Option.getOrNull(yield* modelOf(row.collection));
    const title = dataFrom(row.dataJson)[model?.titleField ?? 'title'];

    return new TrashedEntry({
      collection: row.collection,
      slug: row.slug,
      revision: row.revision,
      title: Predicate.isString(title) ? title : row.slug,
      trashedAt: row.trashedAt,
      ownerId: decodeUser(row.ownerId),
      hasChanges: row.dirty,
      canRestore
    });
  });

export const listTrash = <U>(
  user: Named<U, UserId>,
  cursor: string | undefined,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const after = cursor ? Option.getOrNull(decodeCursor(cursor)) : null;
    const rows = yield* db
      .select()
      .from(contentWork)
      .where(
        and(
          eq(contentWork.status, 'trashed'),
          access.kind === 'CanReadAllContent'
            ? undefined
            : eq(contentWork.ownerId, user.value),
          after
            ? or(
                lt(contentWork.trashedAt, after.at),
                and(
                  eq(contentWork.trashedAt, after.at),
                  gt(contentWork.path, after.path)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(contentWork.trashedAt), asc(contentWork.path))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const items = yield* Effect.forEach(page, row =>
      name(decodeRef({ collection: row.collection, slug: row.slug }), entry =>
        Effect.flatMap(
          Effect.result(canPublishEntry(user, entry)),
          permission => presentTrash(row, Result.isSuccess(permission))
        )
      )
    );
    const last = page.at(-1);

    return new TrashPage({
      items,
      nextCursor:
        rows.length > PAGE_SIZE && last?.trashedAt
          ? encodeCursor({ at: last.trashedAt, path: last.path })
          : null
    });
  });
