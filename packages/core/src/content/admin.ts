import type { Named } from '@gdp-ts/core';
import {
  CollectionNotFound,
  CollectionSummary,
  ContentProblem,
  EntryNotFound,
  EntryPage,
  IndexedEntry,
  type UserId
} from '@venda/contract';
import { modelFrom } from '@venda/content';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { DateTime, Effect, Result, Schema } from 'effect';
import type { CanBrowseContent } from '../auth/proofs/can-browse-content';
import type { IsAdministrator } from '../auth/proofs/is-administrator';
import { Database } from '../database';
import {
  contentCollections,
  contentEntries,
  contentProblems,
  contentWork
} from './schema';
import { changedSlugs, newEntries, newEntryOf } from './admin-copies';
import { collectionField } from './fields';
import {
  pageCursor,
  encodeCursor,
  PAGE_SIZE,
  type EntryCursor
} from './page-cursor';
import { hasCollection } from './tables';

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const decodeData = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

export const listCollections = <U>(_access: CanBrowseContent<U>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db
      .select()
      .from(contentCollections)
      .orderBy(asc(contentCollections.slug));

    return rows.map(row => {
      const model = Result.getOrThrow(modelFrom(decodeJson(row.modelJson)));

      return new CollectionSummary({
        slug: row.slug,
        name: model.name,
        description: model.description ?? null,
        kind: model.kind,
        view: model.view ?? null,
        editor: model.editor ?? null,
        titleField: model.titleField ?? null,
        bodyField: model.bodyField ?? null,
        fields: Object.entries(model.fields).map(([key, field]) =>
          collectionField(key, field)
        )
      });
    });
  });

export interface EntryQuery {
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
}

const indexedEntry = (
  row: typeof contentEntries.$inferSelect,
  now: string,
  changed: boolean
) =>
  new IndexedEntry({
    collection: row.collection,
    slug: row.slug,
    state: row.draft
      ? 'draft'
      : row.publishedAt !== null && row.publishedAt > now
        ? 'future'
        : 'published',
    copy: changed ? 'changes' : 'none',
    publishedAt: row.publishedAt,
    data: decodeData(row.dataJson)
  });

const visibleEntries = <U>(
  user: Named<U, UserId>,
  access: CanBrowseContent<U>,
  now: string
) =>
  access.kind === 'CanReadAllContent'
    ? undefined
    : or(
        and(
          eq(contentEntries.draft, false),
          or(
            isNull(contentEntries.publishedAt),
            lte(contentEntries.publishedAt, now)
          )
        ),
        sql`EXISTS (SELECT 1 FROM ${contentWork} WHERE ${contentWork.collection} = ${contentEntries.collection}
        AND ${contentWork.slug} = ${contentEntries.slug} AND ${contentWork.ownerId} = ${user.value})`
      );

/** The collection and visibility scope shared by list and single-entry reads. */
const collectionScope = <U>(
  user: Named<U, UserId>,
  collection: string,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    if (!(yield* hasCollection(collection)))
      return yield* new CollectionNotFound({ collection });

    const db = yield* Database;
    const now = DateTime.formatIso(yield* DateTime.now);
    const filter = and(
      eq(contentEntries.collection, collection),
      visibleEntries(user, access, now)
    );

    return { db, now, filter };
  });

// Entries after the cursor in (sort key, slug) order. A cursor that does not
// decode starts from the top: it can only have been tampered with.
const after = (cursor: EntryCursor | undefined) =>
  cursor?.phase === 'files'
    ? or(
        gt(contentEntries.sortKey, cursor.key),
        and(
          eq(contentEntries.sortKey, cursor.key),
          gt(contentEntries.slug, cursor.slug)
        )
      )
    : undefined;

const searchFiles = (search: string | undefined) =>
  search
    ? or(
        sql`instr(lower(${contentEntries.slug}), ${search}) > 0`,
        sql`instr(lower(${contentEntries.dataJson}), ${search}) > 0`
      )
    : undefined;

/**
 * Bounded, cursor-paged reads in the order the collection's kind reads best
 * (order.ts). The proof's kind selects what is visible.
 */
export const listIndexedEntries = <U>(
  user: Named<U, UserId>,
  collection: string,
  query: EntryQuery,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const { db, now, filter } = yield* collectionScope(
      user,
      collection,
      access
    );
    // instr treats the search literally, including SQL wildcard characters.
    const search = query.q?.trim().toLowerCase();
    const cursor = pageCursor(query.cursor);
    const scoped = and(filter, searchFiles(search));

    if (cursor?.phase !== 'files') {
      const [file] = yield* db
        .select({ slug: contentEntries.slug })
        .from(contentEntries)
        .where(scoped)
        .limit(1);
      const fresh = yield* newEntries(
        user,
        collection,
        search,
        access,
        cursor,
        Boolean(file)
      );

      if (fresh.items.length) return fresh;
    }

    const conditions = and(scoped, after(cursor));

    const rows = yield* db
      .select()
      .from(contentEntries)
      .where(conditions)
      .orderBy(asc(contentEntries.sortKey), asc(contentEntries.slug))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const changed = yield* changedSlugs(
      collection,
      page.map(row => row.slug)
    );

    return new EntryPage({
      items: page.map(row => indexedEntry(row, now, changed.has(row.slug))),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor({ phase: 'files', key: last.sortKey, slug: last.slug })
          : null
    });
  });

export const getIndexedEntry = <U>(
  user: Named<U, UserId>,
  collection: string,
  slug: string,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const { db, now, filter } = yield* collectionScope(
      user,
      collection,
      access
    );
    const [row] = yield* db
      .select()
      .from(contentEntries)
      .where(and(filter, eq(contentEntries.slug, slug)));

    if (row !== undefined) {
      const changed = yield* changedSlugs(collection, [slug]);

      return indexedEntry(row, now, changed.has(slug));
    }

    const fresh = yield* newEntryOf(user, collection, slug, access);

    if (fresh === undefined)
      return yield* new EntryNotFound({ collection, slug });

    return fresh;
  });

export const listContentProblems = <A>(_admin: IsAdministrator<A>) =>
  Effect.gen(function* () {
    const db = yield* Database;

    return (yield* db
      .select()
      .from(contentProblems)
      .orderBy(asc(contentProblems.path))).map(row => new ContentProblem(row));
  });
