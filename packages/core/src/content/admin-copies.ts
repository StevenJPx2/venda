// What the admin's lists say about unpublished work: which indexed entries
// have saved changes, and the new entries that have no file yet. A role that
// reads published files only sees the copies of entries it owns.
import type { Named } from '@gdp-ts/core';
import { EntryPage, IndexedEntry, type UserId } from '@venda/contract';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  lt,
  or,
  inArray,
  isNotNull,
  isNull,
  sql
} from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { CanBrowseContent } from '../auth/proofs/can-browse-content';
import { Database } from '../database';
import { contentWork } from './schema';
import { encodeCursor, PAGE_SIZE, type EntryCursor } from './page-cursor';

const decodeData = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

const visibleCopies = <U>(
  user: Named<U, UserId>,
  access: CanBrowseContent<U>
) =>
  access.kind === 'CanReadAllContent'
    ? undefined
    : eq(contentWork.ownerId, user.value);

/** The slugs among these whose files have saved, unpublished changes. */
export const changedSlugs = (
  collection: string,
  slugs: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    if (slugs.length === 0) return new Set<string>();

    const db = yield* Database;
    const rows = yield* db
      .select({ slug: contentWork.slug })
      .from(contentWork)
      .where(
        and(
          eq(contentWork.collection, collection),
          inArray(contentWork.slug, [...slugs]),
          eq(contentWork.dirty, true),
          isNotNull(contentWork.baseSha)
        )
      );

    return new Set(rows.map(row => row.slug));
  });

const newEntry = (row: typeof contentWork.$inferSelect) =>
  new IndexedEntry({
    collection: row.collection,
    slug: row.slug,
    state: 'draft',
    copy: 'new',
    publishedAt: row.publishedAt,
    data: decodeData(row.dataJson)
  });

const afterNew = (cursor: EntryCursor | undefined) =>
  cursor &&
  or(
    lt(contentWork.updatedAt, cursor.key),
    and(
      eq(contentWork.updatedAt, cursor.key),
      gt(contentWork.slug, cursor.slug)
    )
  );

/** New entries without a file, newest first, matching the search if there is one. */
export const newEntries = <U>(
  user: Named<U, UserId>,
  collection: string,
  search: string | undefined,
  access: CanBrowseContent<U>,
  cursor: EntryCursor | undefined,
  hasFiles: boolean
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db
      .select()
      .from(contentWork)
      .where(
        and(
          eq(contentWork.collection, collection),
          isNull(contentWork.baseSha),
          eq(contentWork.dirty, true),
          visibleCopies(user, access),
          afterNew(cursor),
          search
            ? sql`(instr(lower(${contentWork.slug}), ${search}) > 0 OR instr(lower(${contentWork.dataJson}), ${search}) > 0)`
            : undefined
        )
      )
      .orderBy(desc(contentWork.updatedAt), asc(contentWork.slug))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);

    return new EntryPage({
      items: page.map(newEntry),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor({
              phase: 'new',
              key: last.updatedAt ?? '',
              slug: last.slug
            })
          : hasFiles
            ? encodeCursor({ phase: 'files', key: '', slug: '' })
            : null
    });
  });

/** One new entry without a file, if this person may see it. */
export const newEntryOf = <U>(
  user: Named<U, UserId>,
  collection: string,
  slug: string,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select()
      .from(contentWork)
      .where(
        and(
          eq(contentWork.collection, collection),
          eq(contentWork.slug, slug),
          isNull(contentWork.baseSha),
          eq(contentWork.dirty, true),
          visibleCopies(user, access)
        )
      );

    return row ? newEntry(row) : undefined;
  });
