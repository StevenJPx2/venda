// The public content API's reads: published entries of file collections.
import { CollectionNotFound, EntryNotFound, PublicEntry } from '@venda/contract';
import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';
import { contentEntries } from './schema';
import { Database } from '../database';
import { hasCollection } from './tables';

const decodeData = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)));

const toPublicEntry = Effect.fnUntraced(function*(row: typeof contentEntries.$inferSelect) {
  // The index wrote this JSON itself; a row that does not decode is a bug.
  const data = yield* Effect.orDie(decodeData(row.dataJson));

  return new PublicEntry({ collection: row.collection, slug: row.slug, publishedAt: row.publishedAt, data });
});

// Not a draft, and not dated in the future.
const published = (collection: string, now: string) => and(
  eq(contentEntries.collection, collection),
  eq(contentEntries.draft, false),
  or(isNull(contentEntries.publishedAt), lte(contentEntries.publishedAt, now))
);

const requireCollection = Effect.fnUntraced(function*(collection: string) {
  if (!(yield* hasCollection(collection))) return yield* new CollectionNotFound({ collection });
});

/** Published entries, newest first; undated ones after, by slug. */
export const listPublished = Effect.fnUntraced(function*(collection: string) {
  yield* requireCollection(collection);

  const db = yield* Database;
  const now = DateTime.formatIso(yield* DateTime.now);
  const newestFirst = [sql`${contentEntries.publishedAt} IS NULL`, desc(contentEntries.publishedAt), asc(contentEntries.slug)];
  const rows = yield* db.select().from(contentEntries).where(published(collection, now)).orderBy(...newestFirst);

  return yield* Effect.forEach(rows, toPublicEntry);
});

export const getPublished = Effect.fnUntraced(function*(collection: string, slug: string) {
  yield* requireCollection(collection);

  const db = yield* Database;
  const now = DateTime.formatIso(yield* DateTime.now);
  const [row] = yield* db.select().from(contentEntries).where(and(published(collection, now), eq(contentEntries.slug, slug)));

  if (row === undefined) return yield* new EntryNotFound({ collection, slug });

  return yield* toPublicEntry(row);
});
