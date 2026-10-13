import { name } from '@gdp-ts/core';
import { EntryRef, UserId, type Role } from '@venda/contract';
import { asc } from 'drizzle-orm';
import { Effect, ManagedRuntime, Option, Schema } from 'effect';
import {
  canAssignOwner,
  canCreateEntry,
  canEditEntry,
  canPublishEntry
} from '../src/auth';
import { users } from '../src/auth/schema';
import {
  contentSchema,
  createEntry,
  getWorkingCopy,
  saveWorkingCopy,
  discardWorkingCopy,
  publishWorkingCopy,
  rebaseWorkingCopy,
  assignEntryOwner
} from '../src/content';
import { currentShas, fileAt, writeFiles } from '../src/content/files';
import { AtomicWrites, Database } from '../src/database';
import { testDatabase } from './support';

const decodeId = Schema.decodeUnknownSync(UserId);
const decodeRef = Schema.decodeUnknownSync(EntryRef);

export const admin = decodeId('admin');

export const author = decodeId('author');

export const contributor = decodeId('contributor');

export const other = decodeId('other');

export const editor = decodeId('editor');

const ref = decodeRef({ collection: 'blog', slug: 'hello' });

export const post = (title: string) =>
  `---\ntitle: ${title}\ncustom: keep-me\n---\n\nHello **world**.\n`;

type Services = Database | AtomicWrites;

const person = (id: UserId, role: Role): typeof users.$inferInsert => ({
  id,
  name: id,
  email: `${id}@test.local`,
  role,
  status: 'active',
  sessionEpoch: 0,
  createdAt: '2026-10-12T00:00:00Z'
});

export const BLOG = `export default defineCollection({ name: 'Blog', kind: 'posts', fields: {
      title: { type: 'text', required: true, max: 40 }, body: { type: 'richtext', required: true }
    } });`;

/** Someone else changing a file directly (a push from the CLI): no copy, no checks. */
const OUTSIDE = { id: null, name: 'Someone else' };

/** Writes `text` (or deletes, with null) over whatever is there, as someone outside the copy. */
const outsideWrite = (path: string, text: string | null) =>
  Effect.gen(function* () {
    const now = yield* currentShas([path]);

    yield* writeFiles([{ path, text, baseSha: now.get(path) ?? null }], {
      author: OUTSIDE,
      message: 'Outside edit',
      mode: 'keep'
    });
  });

const textAt = (path: string) =>
  Effect.map(fileAt(path), found =>
    Option.getOrUndefined(Option.map(found, file => file.text))
  );

const revisionsOf = Effect.flatMap(Database, db =>
  db
    .select({
      path: contentSchema.contentRevisions.path,
      message: contentSchema.contentRevisions.message,
      author: contentSchema.contentRevisions.authorName
    })
    .from(contentSchema.contentRevisions)
    .orderBy(asc(contentSchema.contentRevisions.id))
);

export async function writeHarness() {
  const runtime = ManagedRuntime.make(testDatabase);
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
  await run(outsideWrite('blog/config.ts', BLOG));
  await run(outsideWrite('blog/hello.md', post('Hello')));
  await run(outsideWrite('blog/second.md', post('Second')));

  // Only what the test itself does counts as history.
  const seeded = (await run(revisionsOf)).length;

  return {
    run,
    close: () => runtime.dispose(),
    /** A file's text now, or undefined. */
    file: (path: string) => run(textAt(path)),
    /** Someone else writes the file directly; null deletes it. */
    outside: (path: string, text: string | null) =>
      run(outsideWrite(path, text)),
    /** Revisions written since the harness started, oldest first. */
    revisions: async () => (await run(revisionsOf)).slice(seeded)
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
