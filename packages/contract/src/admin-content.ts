import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication } from './auth';
import { CollectionNotFound, EntryNotFound } from './content';

export class CollectionSummary extends Schema.Class<CollectionSummary>(
  'venda/contract/CollectionSummary'
)({
  slug: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(['posts', 'pages', 'single', 'records']),
  titleField: Schema.NullOr(Schema.String),
  bodyField: Schema.NullOr(Schema.String)
}) {}

export class IndexedEntry extends Schema.Class<IndexedEntry>(
  'venda/contract/IndexedEntry'
)({
  collection: Schema.String,
  slug: Schema.String,
  state: Schema.Literals(['published', 'draft', 'future']),
  publishedAt: Schema.NullOr(Schema.String),
  data: Schema.Record(Schema.String, Schema.Json)
}) {}

export class EntryPage extends Schema.Class<EntryPage>(
  'venda/contract/EntryPage'
)({
  items: Schema.Array(IndexedEntry),
  nextCursor: Schema.NullOr(Schema.String)
}) {}

export class ContentProblem extends Schema.Class<ContentProblem>(
  'venda/contract/ContentProblem'
)({
  path: Schema.String,
  message: Schema.String,
  line: Schema.NullOr(Schema.Number)
}) {}

export class AdminContentApi extends HttpApiGroup.make('adminContent')
  .add(
    HttpApiEndpoint.get('collections', '/admin/collections', {
      success: Schema.Array(CollectionSummary)
    })
  )
  .add(
    HttpApiEndpoint.get('entries', '/admin/collections/:collection/entries', {
      params: { collection: Schema.String },
      query: {
        cursor: Schema.optional(Schema.String),
        q: Schema.optional(Schema.String)
      },
      success: EntryPage,
      error: CollectionNotFound
    })
  )
  .add(
    HttpApiEndpoint.get('problems', '/admin/content-problems', {
      success: Schema.Array(ContentProblem)
    })
  )
  .add(
    HttpApiEndpoint.get(
      'entry',
      '/admin/collections/:collection/entries/:slug',
      {
        params: { collection: Schema.String, slug: Schema.String },
        success: IndexedEntry,
        error: [CollectionNotFound, EntryNotFound]
      }
    )
  )
  .middleware(Authentication) {}
