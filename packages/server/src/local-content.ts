// Content from a folder on the developer's disk, served over HTTP by
// scripts/content-server.mjs. A Worker cannot read the disk, so in local
// development this replaces the copy built into it: before each request the
// app asks whether the folder changed, and re-indexes first if it did.
import type { ContentCommit } from '@venda/core/content';
import { Schema } from 'effect';
import { Conflict } from '@venda/contract';
import { filesStore } from './content';
import type { ContentFiles, ContentSource } from './target';

// A local server answers at once; anything slower is stuck, not busy.
const TIMEOUT_MS = 5_000;

const decodeKeys = Schema.decodeUnknownSync(Schema.Array(Schema.String));

/** A conditional write to the folder server: the per-run token and the base SHA. */
const writer = (base: URL, token: string) => async (input: ContentCommit) => {
  const response = await fetch(
    new URL(`files/${encodeURIComponent(input.path)}`, base),
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
        ...(input.baseSha === null
          ? { 'if-none-match': '*' }
          : { 'if-match': `"${input.baseSha}"` }),
        'x-venda-content-sha': input.sha
      },
      body: input.content,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  );

  if (response.status === 412)
    throw new Conflict({
      path: input.path,
      sha: response.headers.get('etag')?.replaceAll('"', '') ?? null
    });

  if (!response.ok)
    throw new Error(`Content write answered ${response.status}`);

  return { sha: response.headers.get('etag')?.replaceAll('"', '') ?? '' };
};

export function localContent(base: URL, token?: string): ContentSource {
  let seen: string | undefined;

  const get = async (path: string) => {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok && response.status !== 404)
      throw new Error(`Content server answered ${response.status} for ${path}`);

    return response;
  };

  const files: ContentFiles = {
    getKeys: async () => [...decodeKeys(await (await get('keys')).json())],
    getItemRaw: async key => {
      const response = await get(`files/${encodeURIComponent(key)}`);

      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    }
  };

  return {
    store: filesStore(files, token ? writer(base, token) : undefined),
    invalidate: () => {
      seen = undefined;
    },
    // The server's version changes whenever a file does; an unreachable server
    // keeps the last index serving rather than failing the request.
    changed: async () => {
      const version = await get('version').then(
        response => response.text(),
        (error: Error) => {
          console.error(`[venda] content server unreachable: ${error.message}`);

          return seen;
        }
      );

      if (version === seen) return false;

      seen = version;

      return true;
    }
  };
}
