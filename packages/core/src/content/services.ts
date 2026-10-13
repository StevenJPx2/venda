// What the content domain needs from its host besides the database: the files.
import { Context, type Effect, Schema } from 'effect';
import { Conflict, ContentReadOnly } from '@venda/contract';

export interface ContentCommit {
  readonly path: string;
  readonly content: string;
  readonly baseSha: string | null;
  /** Same intent retried after an uncertain write; equivalent bytes are success. */
  readonly sha: string;
  readonly message: string;
  /** The publisher's display name; the host supplies a non-personal git email. */
  readonly author: string;
}

/** A file in the content store and its git blob SHA. */
export interface StoredFile {
  readonly path: string;
  readonly sha: string;
  /** Bytes, when the store knows them without reading the file. */
  readonly size?: number;
}

export class ContentStoreError extends Schema.TaggedError<ContentStoreError>()(
  'ContentStoreError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect())
  }
) {}

/** A listing and its matching bytes, held still for one sync pass. */
export interface ContentSnapshot {
  /** What the snapshot is of: a commit SHA, or a digest of a folder's listing. */
  readonly version: string;
  readonly files: ReadonlyArray<StoredFile>;
  readonly read: (path: string) => Effect.Effect<string, ContentStoreError>;
}

/** What a content store does; each host source (folder, bundle, GitHub) supplies one. */
export interface ContentFileStore {
  /** Every file, with its SHA, as the source holds it now. */
  readonly list: Effect.Effect<ReadonlyArray<StoredFile>, ContentStoreError>;
  /** One consistent listing and its bytes, for a sync pass. */
  readonly snapshot: Effect.Effect<ContentSnapshot, ContentStoreError>;
  /** A file as the source holds it now. */
  readonly read: (path: string) => Effect.Effect<string, ContentStoreError>;
  readonly writable: boolean;
  readonly commit: (
    input: ContentCommit
  ) => Effect.Effect<
    { readonly sha: string },
    Conflict | ContentReadOnly | ContentStoreError
  >;
}

/** The content files: `<collection>/config.ts` and `<collection>/<slug>.md`. */
export class ContentStore extends Context.Service<
  ContentStore,
  ContentFileStore
>()('venda/core/content/ContentStore') {}

const encoder = new TextEncoder();

/** The SHA git gives a file's content, so local SHAs match GitHub's. */
export async function gitBlobSha(content: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${content.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + content.byteLength);

  blob.set(header);
  blob.set(content, header.byteLength);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', blob));

  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}
