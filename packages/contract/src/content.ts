import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';

/** A published entry as sites read it: `<collection>/<slug>.md`, its date and its fields. */
export class PublicEntry extends Schema.Class<PublicEntry>(
  'venda/contract/PublicEntry'
)({
  collection: Schema.String,
  slug: Schema.String,
  // The file's `publishedAt`, in UTC; null when the file has none.
  publishedAt: Schema.NullOr(Schema.String),
  // Field values by key; the rich-text field holds its document.
  data: Schema.Record(Schema.String, Schema.Json)
}) {}

export class CollectionNotFound extends Schema.TaggedError<CollectionNotFound>()(
  'CollectionNotFound',
  {
    collection: Schema.String
  },
  { httpApiStatus: 404 }
) {}

export class EntryNotFound extends Schema.TaggedError<EntryNotFound>()(
  'EntryNotFound',
  {
    collection: Schema.String,
    slug: Schema.String
  },
  { httpApiStatus: 404 }
) {}

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
