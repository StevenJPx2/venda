import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';

/** A published entry as sites read it. The shape the legacy API served, kept for `@venda/nuxt`. */
export class PublicEntry extends Schema.Class<PublicEntry>('venda/contract/PublicEntry')({
  id: Schema.String,
  collectionId: Schema.String,
  slug: Schema.String,
  // Field values by key; rich-text fields hold their document.
  data: Schema.Record(Schema.String, Schema.Json),
  status: Schema.Literal('published'),
  publishedAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String
}) {}

export class CollectionNotFound extends Schema.TaggedError<CollectionNotFound>()('CollectionNotFound', {
  collection: Schema.String
}, { httpApiStatus: 404 }) {}

export class EntryNotFound extends Schema.TaggedError<EntryNotFound>()('EntryNotFound', {
  collection: Schema.String,
  slug: Schema.String
}, { httpApiStatus: 404 }) {}

const collection = Schema.String;

export class ContentApi extends HttpApiGroup.make('content').add(
  // Published entries, newest first.
  HttpApiEndpoint.get('list', '/content/:collection', {
    params: { collection },
    success: Schema.Array(PublicEntry),
    error: CollectionNotFound
  }),
  HttpApiEndpoint.get('get', '/content/:collection/:slug', {
    params: { collection, slug: Schema.String },
    success: PublicEntry,
    error: [CollectionNotFound, EntryNotFound]
  })
) {}
