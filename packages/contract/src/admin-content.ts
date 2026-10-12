import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication } from './auth';
import { CollectionNotFound, EntryNotFound } from './content';

/** One field of a collection's model, as the admin lays it out. */
export class CollectionField extends Schema.Class<CollectionField>(
  'venda/contract/CollectionField'
)({
  key: Schema.String,
  type: Schema.String,
  label: Schema.NullOr(Schema.String),
  help: Schema.NullOr(Schema.String),
  required: Schema.Boolean,
  /** A select field's choices. */
  options: Schema.NullOr(Schema.Array(Schema.String)),
  /** Bounds: a number's value, or a text's length. */
  min: Schema.NullOr(Schema.Number),
  max: Schema.NullOr(Schema.Number)
}) {}

export class CollectionSummary extends Schema.Class<CollectionSummary>(
  'venda/contract/CollectionSummary'
)({
  slug: Schema.String,
  name: Schema.String,
  /** The collection's own description from its config.ts, if it has one. */
  description: Schema.NullOr(Schema.String),
  kind: Schema.Literals(['posts', 'pages', 'single', 'records']),
  /** Admin plugins the collection names instead of its kind's defaults. */
  view: Schema.NullOr(Schema.String),
  editor: Schema.NullOr(Schema.String),
  titleField: Schema.NullOr(Schema.String),
  bodyField: Schema.NullOr(Schema.String),
  /** The model's fields in config.ts order. */
  fields: Schema.Array(CollectionField)
}) {}

export class IndexedEntry extends Schema.Class<IndexedEntry>(
  'venda/contract/IndexedEntry'
)({
  collection: Schema.String,
  slug: Schema.String,
  state: Schema.Literals(['published', 'draft', 'future']),
  /** Unpublished work in the admin: none, changes to the file, or a new entry with no file yet. */
  copy: Schema.Literals(['none', 'changes', 'new']),
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
