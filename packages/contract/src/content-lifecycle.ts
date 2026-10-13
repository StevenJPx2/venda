import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication, Forbidden, UserId } from './auth';
import { CollectionNotFound, EntryNotFound } from './content';
import {
  Conflict,
  ContentTooLarge,
  EditedElsewhere,
  EntryRef,
  EntryTrashed,
  InvalidContent,
  WorkingCopy
} from './content-write';

export class EntryNotTrashed extends Schema.TaggedError<EntryNotTrashed>()(
  'EntryNotTrashed',
  { collection: Schema.String, slug: Schema.String },
  { httpApiStatus: 409 }
) {}

/** Trash retains the saved copy and ownership; the file returns as a draft. */
export class TrashedEntry extends Schema.Class<TrashedEntry>(
  'venda/TrashedEntry'
)({
  collection: Schema.String,
  slug: Schema.String,
  revision: Schema.Int,
  title: Schema.String,
  trashedAt: Schema.String,
  ownerId: Schema.NullOr(UserId),
  hasChanges: Schema.Boolean,
  canRestore: Schema.Boolean
}) {}

export class TrashPage extends Schema.Class<TrashPage>('venda/TrashPage')({
  items: Schema.Array(TrashedEntry),
  nextCursor: Schema.NullOr(Schema.String)
}) {}

const revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const fileBase = Schema.Struct({ revision, sha: Schema.String });
const errors = [
  Forbidden,
  CollectionNotFound,
  EntryNotFound,
  EntryTrashed,
  EntryNotTrashed,
  Conflict,
  EditedElsewhere,
  InvalidContent,
  ContentTooLarge
] as const;
const base = '/admin/collections/:collection/entries/:slug';

export class ContentLifecycleApi extends HttpApiGroup.make('contentLifecycle')
  .add(
    HttpApiEndpoint.post('unpublish', `${base}/unpublish`, {
      params: EntryRef,
      payload: fileBase,
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.post('republish', `${base}/republish`, {
      params: EntryRef,
      payload: fileBase,
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.post('trash', `${base}/trash`, {
      params: EntryRef,
      payload: fileBase,
      success: TrashedEntry,
      error: errors
    }),
    HttpApiEndpoint.post('restore', `${base}/restore`, {
      params: EntryRef,
      payload: Schema.Struct({ revision }),
      success: WorkingCopy,
      error: errors
    }),
    HttpApiEndpoint.get('listTrash', '/admin/trash', {
      query: { cursor: Schema.optional(Schema.String) },
      success: TrashPage,
      error: Forbidden
    })
  )
  .middleware(Authentication) {}
