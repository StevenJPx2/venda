// The content files themselves, for agents, scripts and the CLI: list and
// read them, write a set of them at once from the SHAs they were read at, and
// import a folder's files.
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Authentication, Forbidden } from './auth';
import {
  Conflict,
  ContentTooLarge,
  EntryTrashed,
  InvalidContent
} from './content-write';

const NAME = '[a-z0-9][a-z0-9_-]*';

/** A content file's path: `site.ts`, `<collection>/config.ts` or `<collection>/<slug>.md(x)`. */
export const CONTENT_PATH = new RegExp(
  `^(?:site\\.ts|${NAME}/config\\.ts|${NAME}/${NAME}\\.mdx?)$`
);

/** At most this many files in one write. */
export const MAX_FILES_PER_WRITE = 200;

/** At most this many bytes in one write's request (each file stays within 1 MB). */
export const MAX_WRITE_BYTES = 25 * 1024 * 1024;

const Batch = <S extends Schema.Top>(item: S) =>
  Schema.Array(item).pipe(
    Schema.check(Schema.isMaxLength(MAX_FILES_PER_WRITE))
  );

export class ContentFile extends Schema.Class<ContentFile>('venda/ContentFile')(
  {
    path: Schema.String,
    sha: Schema.String,
    size: Schema.Int,
    updatedAt: Schema.String
  }
) {}

export class FileText extends Schema.Class<FileText>('venda/FileText')({
  path: Schema.String,
  text: Schema.String,
  sha: Schema.String
}) {}

/** One version of a file; `sha` is null for a deletion. */
export class FileRevision extends Schema.Class<FileRevision>(
  'venda/FileRevision'
)({
  id: Schema.Int,
  sha: Schema.NullOr(Schema.String),
  parentSha: Schema.NullOr(Schema.String),
  message: Schema.String,
  authorName: Schema.String,
  createdAt: Schema.String
}) {}

export class FileNotFound extends Schema.TaggedError<FileNotFound>()(
  'FileNotFound',
  { path: Schema.String },
  { httpApiStatus: 404 }
) {}

/** A file to write from the SHA it was read at (null: it must not exist); `text: null` deletes it. */
export const FileChange = Schema.Struct({
  path: Schema.String,
  text: Schema.NullOr(Schema.String),
  baseSha: Schema.NullOr(Schema.String)
});

export class FilesWritten extends Schema.Class<FilesWritten>(
  'venda/FilesWritten'
)({
  files: Schema.Array(
    Schema.Struct({ path: Schema.String, sha: Schema.NullOr(Schema.String) })
  )
}) {}

export class FilesImported extends Schema.Class<FilesImported>(
  'venda/FilesImported'
)({
  imported: Schema.Int,
  unchanged: Schema.Int
}) {}

const writeErrors = [
  EntryTrashed,
  Forbidden,
  Conflict,
  InvalidContent,
  ContentTooLarge
] as const;

export class ContentFilesApi extends HttpApiGroup.make('files')
  .add(
    HttpApiEndpoint.get('list', '/admin/files', {
      success: Schema.Array(ContentFile),
      error: Forbidden
    }),
    HttpApiEndpoint.get('read', '/admin/files/read', {
      query: { path: Schema.String },
      success: FileText,
      error: [Forbidden, FileNotFound]
    }),
    HttpApiEndpoint.get('revisions', '/admin/files/revisions', {
      query: {
        path: Schema.String,
        before: Schema.optional(Schema.NumberFromString)
      },
      success: Schema.Array(FileRevision),
      error: Forbidden
    }),
    HttpApiEndpoint.get('revision', '/admin/files/revision', {
      query: { path: Schema.String, sha: Schema.String },
      success: FileText,
      error: [Forbidden, FileNotFound]
    }),
    HttpApiEndpoint.post('write', '/admin/files', {
      payload: Schema.Struct({
        message: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
        changes: Batch(FileChange)
      }),
      success: FilesWritten,
      error: writeErrors
    }),
    HttpApiEndpoint.post('import', '/admin/import', {
      payload: Schema.Struct({
        files: Batch(
          Schema.Struct({ path: Schema.String, text: Schema.String })
        )
      }),
      success: FilesImported,
      error: writeErrors
    })
  )
  .middleware(Authentication) {}
