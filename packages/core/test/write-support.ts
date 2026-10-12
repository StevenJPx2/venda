import { name } from '@gdp-ts/core';
import { Conflict, EntryRef, UserId, type Role } from '@venda/contract';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import {
  canAssignOwner,
  canCreateEntry,
  canEditEntry,
  canPublishEntry
} from '../src/auth';
import { users } from '../src/auth/schema';
import {
  ContentStore,
  ContentStoreError,
  createEntry,
  gitBlobSha,
  syncAll,
  getWorkingCopy,
  saveWorkingCopy,
  discardWorkingCopy,
  publishWorkingCopy,
  rebaseWorkingCopy,
  assignEntryOwner
} from '../src/content';
import { AtomicWrites, Database } from '../src/database';
import { testDatabase } from './support';

const decodeId = Schema.decodeUnknownSync(UserId);
const decodeRef = Schema.decodeUnknownSync(EntryRef);

const admin = decodeId('admin');

export const author = decodeId('author');

export const contributor = decodeId('contributor');

export const other = decodeId('other');

export const editor = decodeId('editor');

const ref = decodeRef({ collection: 'blog', slug: 'hello' });

export const post = (title: string) =>
  `---\ntitle: ${title}\ncustom: keep-me\n---\n\nHello **world**.\n`;

const sha = (text: string) => gitBlobSha(new TextEncoder().encode(text));

type Services = ContentStore | Database | AtomicWrites;

const person = (id: UserId, role: Role): typeof users.$inferInsert => ({
  id,
  name: id,
  email: `${id}@test.local`,
  role,
  status: 'active',
  sessionEpoch: 0,
  createdAt: '2026-10-12T00:00:00Z'
});

export async function writeHarness() {
  const files = new Map([
    [
      'blog/config.ts',
      `export default defineCollection({ name: 'Blog', kind: 'posts', fields: {
      title: { type: 'text', required: true, max: 40 }, body: { type: 'richtext', required: true }
    } });`
    ],
    ['blog/hello.md', post('Hello')],
    ['blog/second.md', post('Second')]
  ]);
  let uncertain = false;
  const store = Layer.succeed(ContentStore, {
    writable: true,
    list: Effect.promise(() =>
      Promise.all(
        [...files].map(async ([path, text]) => ({ path, sha: await sha(text) }))
      )
    ),
    read: path => {
      const text = files.get(path);

      return text === undefined
        ? Effect.fail(new ContentStoreError({ message: 'No file' }))
        : Effect.succeed(text);
    },
    commit: input =>
      Effect.gen(function* () {
        const text = files.get(input.path);
        const current =
          text === undefined ? null : yield* Effect.promise(() => sha(text));

        if (current !== input.baseSha && current !== input.sha)
          return yield* new Conflict({ path: input.path, sha: current });

        files.set(input.path, input.content);

        if (uncertain) {
          uncertain = false;

          return yield* new ContentStoreError({
            message: 'Connection lost after write'
          });
        }

        return { sha: input.sha };
      })
  });
  const runtime = ManagedRuntime.make(Layer.merge(testDatabase, store));
  const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
    runtime.runPromise(effect);

  await run(
    Effect.flatMap(Database, db =>
      db
        .insert(users)
        .values([
          person(admin, 'administrator'),
          person(author, 'author'),
          person(contributor, 'contributor'),
          person(other, 'author'),
          person(editor, 'editor')
        ])
    )
  );
  await run(syncAll());

  return {
    files,
    run,
    close: () => runtime.dispose(),
    uncertain: () => {
      uncertain = true;
    }
  };
}

export const readCopy = (id = admin, target = ref) =>
  name(id, target, (user, entry) =>
    Effect.flatMap(canEditEntry(user, entry), proof =>
      getWorkingCopy(user, entry, proof)
    )
  );

export const saveCopy = (
  revision: number,
  data: Readonly<Record<string, Schema.Json>>,
  id = admin,
  target = ref
) =>
  name(id, target, (user, entry) =>
    Effect.flatMap(canEditEntry(user, entry), proof =>
      saveWorkingCopy(user, entry, { revision, data, publishedAt: null }, proof)
    )
  );

export const discardCopy = (revision: number, id = admin, target = ref) =>
  name(id, target, (user, entry) =>
    Effect.flatMap(canEditEntry(user, entry), proof =>
      discardWorkingCopy(user, entry, revision, proof)
    )
  );

/** Starts an entry as `id`, then reads its copy the way the API does. */
export const createCopy = (
  slug: string,
  data: Readonly<Record<string, Schema.Json>>,
  id = admin
) =>
  Effect.flatMap(
    name(id, 'blog', (user, collection) =>
      Effect.flatMap(canCreateEntry(user, collection), proof =>
        createEntry(user, collection, { slug, data }, proof)
      )
    ),
    created => readCopy(id, created)
  );

export const entryRef = (slug: string) =>
  decodeRef({ collection: 'blog', slug });

export const publishCopy = (revision: number, id = admin, target = ref) =>
  name(id, target, (user, entry) =>
    Effect.flatMap(canPublishEntry(user, entry), proof =>
      publishWorkingCopy(user, entry, revision, proof)
    )
  );

export const rebaseCopy = (revision: number, sha: string) =>
  name(admin, ref, (user, entry) =>
    Effect.flatMap(canEditEntry(user, entry), proof =>
      rebaseWorkingCopy(user, entry, revision, sha, proof)
    )
  );

export const assignOwner = (revision: number, id: UserId, actor = admin) =>
  name(actor, ref, (user, entry) =>
    Effect.flatMap(canAssignOwner(user, entry), proof =>
      assignEntryOwner(user, entry, revision, id, proof)
    )
  );
