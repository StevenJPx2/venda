import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication, Forbidden, UserId } from './auth';
import { CollectionNotFound, EntryNotFound, SiteSettings } from './content';

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

export class EntryTrashed extends Schema.TaggedError<EntryTrashed>()(
  'EntryTrashed',
  entryFields,
  { httpApiStatus: 409 }
) {}

export class SlugTaken extends Schema.TaggedError<SlugTaken>()(
  'SlugTaken',
  { slug: Schema.String },
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
    /** The file the copy started from; null for an entry that has no file yet. */
    baseSha: Schema.NullOr(Schema.String),
    data: Schema.Record(Schema.String, Schema.Json),
    publishedAt: Schema.NullOr(Schema.String),
    dirty: Schema.Boolean,
    changedOutside: Schema.Boolean,
    currentSha: Schema.NullOr(Schema.String),
    ownerId: Schema.NullOr(UserId),
    updatedBy: Schema.NullOr(UserId),
    updatedAt: Schema.NullOr(Schema.String),
    canPublish: Schema.Boolean,
    indexProblem: Schema.NullOr(Schema.String)
  }
) {}

const revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const base = '/admin/collections/:collection/entries/:slug';
const errors = [
  ContentTooLarge,
  CollectionNotFound,
  EntryNotFound,
  EntryTrashed,
  Forbidden,
  EditedElsewhere,
  InvalidContent,
  Conflict,
  SlugTaken
] as const;

/** The site's settings file as the admin edits it, with the SHA it was read at. */
export class SiteDocument extends Schema.Class<SiteDocument>(
  'venda/SiteDocument'
)({
  settings: SiteSettings,
  /** Null while `site.ts` does not exist. */
  sha: Schema.NullOr(Schema.String)
}) {}

export class ContentWriteApi extends HttpApiGroup.make('contentWrite')
  .add(
    HttpApiEndpoint.post('create', '/admin/collections/:collection/entries', {
      params: { collection: Schema.String },
      payload: Schema.Struct({
        slug: Schema.String,
        data: Schema.Record(Schema.String, Schema.Json)
      }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.get('site', '/admin/site', {
      success: SiteDocument,
      error: [Forbidden, InvalidContent]
    }),
    HttpApiEndpoint.put('saveSite', '/admin/site', {
      payload: Schema.Struct({
        baseSha: Schema.NullOr(Schema.String),
        name: Schema.NullOr(Schema.String),
        url: Schema.NullOr(Schema.String),
        screens: Schema.Record(Schema.String, Schema.String)
      }),
      success: SiteDocument,
      error: [Forbidden, Conflict, InvalidContent, ContentTooLarge]
    }),
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
    // A copy that never had a file is removed whole: the answer is then null.
    HttpApiEndpoint.delete('discard', `${base}/copy`, {
      params: EntryRef,
      payload: Schema.Struct({ revision }),
      success: Schema.NullOr(WorkingCopy),
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
