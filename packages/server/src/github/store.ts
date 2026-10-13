// The content folder of one branch of one GitHub repository, as a content
// store. Sync reads a snapshot pinned to one commit; Publish writes with the
// blob SHA it edited from, and never over somebody else's change.
import { Conflict } from '@venda/contract';
import {
  ContentStoreError,
  type ContentCommit,
  type ContentFileStore,
  type StoredFile
} from '@venda/core/content';
import { Effect, Predicate, Schema } from 'effect';
import {
  GitHubError,
  type FileWrite,
  type GitHubApi,
  type GitHubReply
} from './api';
import type { GitHubConfig } from './config';
import { base64FromText, textFromBase64 } from './encoding';
import {
  contentFiles,
  leadsTo,
  prefixOf,
  Tree,
  writeDecision,
  type TreeEntry
} from './tree';

const Ref = Schema.Struct({ object: Schema.Struct({ sha: Schema.String }) });

const Commit = Schema.Struct({ tree: Schema.Struct({ sha: Schema.String }) });

const Blob = Schema.Struct({ content: Schema.String, encoding: Schema.String });

const File = Schema.Struct({
  type: Schema.String,
  sha: Schema.String,
  content: Schema.String,
  encoding: Schema.String
});

const Written = Schema.Struct({
  content: Schema.Struct({ sha: Schema.String })
});

/** A successful answer's body, decoded by `schema`. */
const decode =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (reply: GitHubReply, what: string): A => {
    if (reply.status !== 200 && reply.status !== 201)
      throw new GitHubError(
        `GitHub answered ${reply.status} for ${what}`,
        reply.status
      );

    return Schema.decodeUnknownSync(schema)(reply.body);
  };

const storeError = (message: string) => (cause: unknown) =>
  new ContentStoreError({ message, cause });

const segments = (path: string) =>
  path.split('/').map(encodeURIComponent).join('/');

export function githubStore(
  config: GitHubConfig,
  api: GitHubApi
): ContentFileStore {
  const tree = treeReader(config, api);
  const files = fileReader(config, api);

  return {
    writable: true,
    list: Effect.tryPromise({
      try: async () => (await tree.snapshot()).files,
      catch: storeError('Could not list the repository content')
    }),
    snapshot: Effect.tryPromise({
      try: () => tree.snapshot(),
      catch: storeError('Could not read the repository content')
    }).pipe(
      Effect.map(({ files: listed, blob }) => ({
        files: listed,
        read: (path: string) =>
          Effect.tryPromise({
            try: () => blob(path),
            catch: storeError(`Could not read ${path}`)
          })
      }))
    ),
    read: path =>
      Effect.tryPromise({
        try: async () => {
          const file = await files.current(path);

          if (file === null)
            throw new Error(`${path} is not in the repository`);

          return file.text;
        },
        catch: storeError(`Could not read ${path}`)
      }),
    commit: input =>
      Effect.tryPromise({
        try: () => files.write(input),
        catch: cause =>
          cause instanceof Conflict
            ? cause
            : storeError(`Could not publish ${input.path} to GitHub`)(cause)
      })
  };
}

/** Lists the branch's content at one commit, and reads blobs by their SHA. */
function treeReader(config: GitHubConfig, api: GitHubApi) {
  const decodeRef = decode(Ref);
  const decodeCommit = decode(Commit);
  const decodeTree = decode(Tree);
  const decodeBlob = decode(Blob);

  const rootTree = async () => {
    const ref = await api.repo(
      'GET',
      `git/ref/heads/${segments(config.branch)}`
    );

    if (ref.status === 404)
      throw new GitHubError(`The branch ${config.branch} does not exist`, 404);

    const head = decodeRef(ref, 'the branch').object.sha;

    return decodeCommit(
      await api.repo('GET', `git/commits/${head}`),
      'the commit'
    ).tree.sha;
  };

  // A tree too large for one answer is walked a level at a time, only where it leads to the content.
  const walk = async (sha: string, base: string): Promise<TreeEntry[]> => {
    const level = decodeTree(
      await api.repo('GET', `git/trees/${sha}`),
      'a tree'
    );
    const found: TreeEntry[] = [];

    for (const entry of level.tree) {
      const path = base + entry.path;

      if (entry.type === 'tree' && leadsTo(path, config.dir))
        found.push(...(await walk(entry.sha, `${path}/`)));
      else found.push({ ...entry, path });
    }

    return found;
  };

  const entries = async (root: string) => {
    const whole = decodeTree(
      await api.repo('GET', `git/trees/${root}?recursive=1`),
      'the tree'
    );

    return whole.truncated ? walk(root, '') : whole.tree;
  };

  const snapshot = async () => {
    const listed: StoredFile[] = contentFiles(
      await entries(await rootTree()),
      config.dir
    );
    const shas = new Map(listed.map(file => [file.path, file.sha]));

    const blob = async (path: string) => {
      const sha = shas.get(path);

      if (sha === undefined) throw new Error(`${path} is not in this snapshot`);

      const body = decodeBlob(await api.repo('GET', `git/blobs/${sha}`), path);

      return textFromBase64(body.content);
    };

    return { files: listed, blob };
  };

  return { snapshot };
}

/** The file as the branch holds it now, and the conditional write. */
function fileReader(config: GitHubConfig, api: GitHubApi) {
  const decodeFile = decode(File);
  const decodeWritten = decode(Written);
  const location = (path: string) =>
    `contents/${segments(prefixOf(config.dir) + path)}`;

  const current = async (path: string) => {
    const reply = await api.repo(
      'GET',
      `${location(path)}?ref=${encodeURIComponent(config.branch)}`
    );

    if (reply.status === 404) return null;

    const file = decodeFile(reply, path);

    if (file.type !== 'file' || file.encoding !== 'base64')
      throw new Error(`${path} is not a file Venda can read`);

    return { sha: file.sha, text: textFromBase64(file.content) };
  };

  const settle = async (input: ContentCommit) => {
    const now = (await current(input.path))?.sha ?? null;
    const decision = writeDecision(now, input.baseSha, input.sha);

    if (decision === 'conflict')
      throw new Conflict({ path: input.path, sha: now });

    return decision;
  };

  const write = async (input: ContentCommit) => {
    if ((await settle(input)) === 'done') return { sha: input.sha };

    const fields = {
      message: input.message,
      content: base64FromText(input.content),
      branch: config.branch,
      author: { name: input.author, email: config.authorEmail }
    };
    // A new file is created without a SHA; GitHub refuses one that exists.
    const body: FileWrite =
      input.baseSha === null ? fields : { ...fields, sha: input.baseSha };
    const reply = await api.repo('PUT', location(input.path), body);

    if (reply.status === 200 || reply.status === 201)
      return { sha: decodeWritten(reply, input.path).content.sha };

    // GitHub says 409 or 422 when the file moved; anything else is not a conflict.
    if (
      (reply.status === 409 || reply.status === 422) &&
      (await settle(input)) === 'done'
    )
      return { sha: input.sha };

    throw new GitHubError(refusal(reply), reply.status);
  };

  return { current, write };
}

const refusal = (reply: GitHubReply) => {
  const body = reply.body;
  const message =
    Predicate.isObject(body) && Predicate.isString(body.message)
      ? body.message
      : '';

  return `GitHub refused the write (${reply.status})${message ? `: ${message}` : ''}`;
};
