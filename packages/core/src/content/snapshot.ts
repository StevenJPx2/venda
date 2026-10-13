import { Effect } from 'effect';
import {
  ContentStoreError,
  gitBlobSha,
  type ContentSnapshot
} from './services';

/** Freeze text and hash those same bytes, never a later read of a mutable path. */
export const snapshotOf = (source: ReadonlyMap<string, string>) =>
  Effect.promise(async (): Promise<ContentSnapshot> => {
    const texts = new Map(source);
    const files = await Promise.all(
      [...texts].map(async ([path, text]) => {
        const bytes = new TextEncoder().encode(text);

        return { path, sha: await gitBlobSha(bytes), size: bytes.byteLength };
      })
    );

    // A folder has no commit; its version is a digest of what it lists.
    const listing = files
      .map(file => `${file.path} ${file.sha}`)
      .sort()
      .join('\n');

    return {
      version: await gitBlobSha(new TextEncoder().encode(listing)),
      files,
      read: path => {
        const text = texts.get(path);

        return text === undefined
          ? Effect.fail(new ContentStoreError({ message: `No file ${path}` }))
          : Effect.succeed(text);
      }
    };
  });
