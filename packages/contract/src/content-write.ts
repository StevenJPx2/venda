import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication, Forbidden, UserId } from './auth';
import { CollectionNotFound, EntryNotFound } from './content';

const entryFields = {
  collection: Schema.String,
  slug: Schema.String
};

export const EntryRef = Schema.Struct(entryFields).pipe(
  Schema.brand('EntryRef')
);

export type EntryRef = typeof EntryRef.Type;

export const MAX_CONTENT_BYTES = 1_048_576;

export class ContentTooLarge extends Schema.TaggedError<ContentTooLarge>()(
  'ContentTooLarge',
  {},
  { httpApiStatus: 413 }
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  'Conflict',
  { path: Schema.String, sha: Schema.NullOr(Schema.String) },
  { httpApiStatus: 409 }
) {}

export class EditedElsewhere extends Schema.TaggedError<EditedElsewhere>()(
  'EditedElsewhere',
  { revision: Schema.Int },
  { httpApiStatus: 409 }
) {}

export class PublishInProgress extends Schema.TaggedError<PublishInProgress>()(
  'PublishInProgress',
  {},
  { httpApiStatus: 409 }
) {}

export class ContentReadOnly extends Schema.TaggedError<ContentReadOnly>()(
  'ContentReadOnly',
  {},
  { httpApiStatus: 409 }
) {}

export class InvalidContent extends Schema.TaggedError<InvalidContent>()(
  'InvalidContent',
  { message: Schema.String },
  { httpApiStatus: 400 }
) {}

export class WorkingCopy extends Schema.Class<WorkingCopy>('venda/WorkingCopy')(
  {
    ...entryFields,
    revision: Schema.Int,
    baseSha: Schema.String,
    data: Schema.Record(Schema.String, Schema.Json),
    publishedAt: Schema.NullOr(Schema.String),
    dirty: Schema.Boolean,
    publishing: Schema.Boolean,
    changedOutside: Schema.Boolean,
    currentSha: Schema.NullOr(Schema.String),
    ownerId: Schema.NullOr(UserId),
    updatedBy: Schema.NullOr(UserId),
    updatedAt: Schema.NullOr(Schema.String),
    canPublish: Schema.Boolean,
    writable: Schema.Boolean,
    indexProblem: Schema.NullOr(Schema.String)
  }
) {}

const revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const base = '/admin/collections/:collection/entries/:slug';
const errors = [
  ContentTooLarge,
  CollectionNotFound,
  EntryNotFound,
  Forbidden,
  EditedElsewhere,
  PublishInProgress,
  ContentReadOnly,
  InvalidContent,
  Conflict
] as const;

export class ContentWriteApi extends HttpApiGroup.make('contentWrite')
  .add(
    HttpApiEndpoint.get('copy', `${base}/copy`, {
      params: EntryRef,
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.put('save', `${base}/copy`, {
      params: EntryRef,
      payload: Schema.Struct({
        revision,
        data: Schema.Record(Schema.String, Schema.Json),
        publishedAt: Schema.NullOr(Schema.String)
      }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.delete('discard', `${base}/copy`, {
      params: EntryRef,
      payload: Schema.Struct({ revision }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.post('publish', `${base}/publish`, {
      params: EntryRef,
      payload: Schema.Struct({ revision }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.post('rebase', `${base}/copy/rebase`, {
      params: EntryRef,
      payload: Schema.Struct({ revision, sha: Schema.String }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.put('owner', `${base}/owner`, {
      params: EntryRef,
      payload: Schema.Struct({ revision, ownerId: Schema.NullOr(UserId) }),
      success: WorkingCopy,
      error: errors
    })
  )
  .middleware(Authentication) {}
