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
import { DateTime, Effect, Option, Result, Schema } from 'effect';
import type { CanBrowseContent } from '../auth/proofs/can-browse-content';
import type { IsAdministrator } from '../auth/proofs/is-administrator';
import { Database } from '../database';
import { contentCollections, contentEntries, contentProblems } from './schema';
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
        kind: model.kind,
        titleField: model.titleField ?? null,
        bodyField: model.bodyField ?? null
      });
    });
  });

const PAGE_SIZE = 50;

export interface EntryQuery {
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
}

const indexedEntry = (row: typeof contentEntries.$inferSelect, now: string) =>
  new IndexedEntry({
    collection: row.collection,
    slug: row.slug,
    state: row.draft
      ? 'draft'
      : row.publishedAt !== null && row.publishedAt > now
        ? 'future'
        : 'published',
    publishedAt: row.publishedAt,
    data: decodeData(row.dataJson)
  });

const visibleEntries = <U>(access: CanBrowseContent<U>, now: string) =>
  access.kind === 'CanReadAllContent'
    ? undefined
    : and(
        eq(contentEntries.draft, false),
        or(
          isNull(contentEntries.publishedAt),
          lte(contentEntries.publishedAt, now)
        )
      );

/** The collection and visibility scope shared by list and single-entry reads. */
const collectionScope = <U>(collection: string, access: CanBrowseContent<U>) =>
  Effect.gen(function* () {
    if (!(yield* hasCollection(collection)))
      return yield* new CollectionNotFound({ collection });

    const db = yield* Database;
    const now = DateTime.formatIso(yield* DateTime.now);
    const filter = and(
      eq(contentEntries.collection, collection),
      visibleEntries(access, now)
    );

    return { db, now, filter };
  });

// A page ends at an entry's (sort key, slug); the next page starts after it.
const Cursor = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String])
);
const encodeCursor = Schema.encodeSync(Cursor);
const decodeCursor = Schema.decodeUnknownOption(Cursor);

// Entries after the cursor in (sort key, slug) order. A cursor that does not
// decode starts from the top: it can only have been tampered with.
const after = (cursor: string | undefined) =>
  Option.match(cursor === undefined ? Option.none() : decodeCursor(cursor), {
    onNone: () => undefined,
    onSome: ([key, slug]) =>
      or(
        gt(contentEntries.sortKey, key),
        and(eq(contentEntries.sortKey, key), gt(contentEntries.slug, slug))
      )
  });

/**
 * Bounded, cursor-paged reads in the order the collection's kind reads best
 * (order.ts). The proof's kind selects what is visible.
 */
export const listIndexedEntries = <U>(
  _user: Named<U, UserId>,
  collection: string,
  query: EntryQuery,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const { db, now, filter } = yield* collectionScope(collection, access);
    // instr treats the search literally, including SQL wildcard characters.
    const search = query.q?.trim().toLowerCase();

    const conditions = and(
      filter,
      after(query.cursor),
      search
        ? or(
            sql`instr(lower(${contentEntries.slug}), ${search}) > 0`,
            sql`instr(lower(${contentEntries.dataJson}), ${search}) > 0`
          )
        : undefined
    );

    const rows = yield* db
      .select()
      .from(contentEntries)
      .where(conditions)
      .orderBy(asc(contentEntries.sortKey), asc(contentEntries.slug))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);

    return new EntryPage({
      items: page.map(row => indexedEntry(row, now)),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor([last.sortKey, last.slug])
          : null
    });
  });

export const getIndexedEntry = <U>(
  _user: Named<U, UserId>,
  collection: string,
  slug: string,
  access: CanBrowseContent<U>
) =>
  Effect.gen(function* () {
    const { db, now, filter } = yield* collectionScope(collection, access);
    const [row] = yield* db
      .select()
      .from(contentEntries)
      .where(and(filter, eq(contentEntries.slug, slug)));

    if (row === undefined)
      return yield* new EntryNotFound({ collection, slug });

    return indexedEntry(row, now);
  });

export const listContentProblems = <A>(_admin: IsAdministrator<A>) =>
  Effect.gen(function* () {
    const db = yield* Database;

    return (yield* db
      .select()
      .from(contentProblems)
      .orderBy(asc(contentProblems.path))).map(row => new ContentProblem(row));
  });
