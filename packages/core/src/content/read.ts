// The public content API's reads: published entries of file collections.
import { CollectionNotFound, EntryNotFound, PublicEntry } from '@venda/contract';
import { DateTime, Effect, Schema } from 'effect';
import { select } from './tables';

const EntryRow = Schema.Struct({
  collection: Schema.String,
  slug: Schema.String,
  published_at: Schema.NullOr(Schema.String),
  data_json: Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  created_at: Schema.String,
  updated_at: Schema.String
});

const toPublicEntry = (row: typeof EntryRow.Type) => new PublicEntry({
  id: `${row.collection}/${row.slug}`,
  collectionId: row.collection,
  slug: row.slug,
  data: row.data_json,
  status: 'published',
  publishedAt: row.published_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Not a draft, and not dated in the future.
const PUBLISHED = 'collection = ? AND draft = 0 AND (published_at IS NULL OR published_at <= ?)';

const COLUMNS = 'collection, slug, published_at, data_json, created_at, updated_at';

const requireCollection = Effect.fnUntraced(function*(collection: string) {
  const [found] = yield* select(Schema.Struct({ slug: Schema.String }), 'SELECT slug FROM content_collections WHERE slug = ?', [collection]);

  if (found === undefined) return yield* new CollectionNotFound({ collection });
});

/** Published entries, newest first; undated ones after, by slug. */
export const listPublished = Effect.fnUntraced(function*(collection: string) {
  yield* requireCollection(collection);

  const now = DateTime.formatIso(yield* DateTime.now);
  const rows = yield* select(EntryRow, `SELECT ${COLUMNS} FROM content_entries WHERE ${PUBLISHED} ORDER BY published_at IS NULL, published_at DESC, slug`, [collection, now]);

  return rows.map(toPublicEntry);
});

export const getPublished = Effect.fnUntraced(function*(collection: string, slug: string) {
  yield* requireCollection(collection);

  const now = DateTime.formatIso(yield* DateTime.now);
  const [row] = yield* select(EntryRow, `SELECT ${COLUMNS} FROM content_entries WHERE ${PUBLISHED} AND slug = ?`, [collection, now, slug]);

  if (row === undefined) return yield* new EntryNotFound({ collection, slug });

  return toPublicEntry(row);
});
