import { name } from '@gdp-ts/core';
import { Conflict, type UserId, type WorkingCopy } from '@venda/contract';
import { Effect, Option, Result } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canBrowseContent, canPublishEntry } from '../src/auth';
import {
  getPublished,
  listTrash,
  restoreEntry,
  setEntryVisibility,
  trashEntry
} from '../src/content';
import { fileAt, writeFiles } from '../src/content/files';
import { AtomicWrites, type Database } from '../src/database';
import {
  admin,
  assignOwner,
  author,
  BLOG,
  contributor,
  createCopy,
  editor,
  entryRef,
  other,
  post,
  publishCopy,
  readCopy,
  saveCopy,
  writeHarness
} from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

type Services = AtomicWrites | Database;

const hello = entryRef('hello');

const fileBase = (copy: WorkingCopy) => ({
  revision: copy.revision,
  sha: copy.currentSha ?? ''
});

const visibility = (
  copy: WorkingCopy,
  state: 'draft' | 'published',
  id = admin
) =>
  name(id, hello, (user, entry) =>
    Effect.flatMap(canPublishEntry(user, entry), proof =>
      setEntryVisibility(user, entry, fileBase(copy), state, proof)
    )
  );

const trash = (copy: WorkingCopy, id = admin) =>
  name(id, hello, (user, entry) =>
    Effect.flatMap(canPublishEntry(user, entry), proof =>
      trashEntry(user, entry, fileBase(copy), proof)
    )
  );

const restore = (revision: number, id = admin) =>
  name(id, hello, (user, entry) =>
    Effect.flatMap(canPublishEntry(user, entry), proof =>
      restoreEntry(user, entry, revision, proof)
    )
  );

const bin = (id: UserId = admin, cursor?: string) =>
  name(id, user =>
    Effect.flatMap(canBrowseContent(user), proof =>
      listTrash(user, cursor, proof)
    )
  );

const failed = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  h.run(Effect.result(effect));

/** The tag a refused action failed with, or `ok`. */
const failureTag = <A, E extends { readonly _tag: string }>(
  result: Result.Result<A, E>
) => (Result.isFailure(result) ? result.failure._tag : 'ok');

const refusal = async <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E, Services>
) => failureTag(await failed(effect));

const unpublished = async () =>
  Result.isFailure(await failed(getPublished('blog', 'hello')));

const titleOnSite = async () =>
  (await h.run(getPublished('blog', 'hello'))).data.title;

const config = (text: string) =>
  Effect.gen(function* () {
    const old = yield* fileAt('blog/config.ts');

    yield* writeFiles(
      [
        {
          path: 'blog/config.ts',
          text,
          baseSha: Option.getOrNull(old)?.sha ?? null
        }
      ],
      {
        author: { id: null, name: 'Model editor' },
        message: 'Edit model',
        mode: 'strict'
      }
    );
  });

const renamed = () => config(BLOG.replace("name: 'Blog'", "name: 'Notes'"));

/** Interleave at the real batch boundary, after indexing reads and before any write. */
const beforeBatch = <A, E, B, E2>(
  first: Effect.Effect<A, E, Services>,
  second: Effect.Effect<B, E2, Services>
) =>
  Effect.gen(function* () {
    const atomic = yield* AtomicWrites;
    let interleaved = false;

    return yield* first.pipe(
      Effect.provideService(AtomicWrites, {
        run: statements =>
          Effect.gen(function* () {
            if (!interleaved) {
              interleaved = true;
              yield* second.pipe(
                Effect.provideService(AtomicWrites, atomic),
                Effect.orDie
              );
            }

            yield* atomic.run(statements);
          })
      })
    );
  });

const saveTitle = (copy: WorkingCopy, title: string, id = admin) =>
  h.run(saveCopy(copy.revision, { ...copy.data, title }, id));

describe('public state', () => {
  it('never acknowledges an outside change on behalf of a dirty copy', async () => {
    await saveTitle(await h.run(readCopy()), 'Mine');
    await h.outside('blog/hello.md', post('Theirs'));

    const hidden = await h.run(visibility(await h.run(readCopy()), 'draft'));

    expect(hidden.changedOutside).toBe(true);
    expect(hidden.data.title).toBe('Mine');
    expect(await h.file('blog/hello.md')).toContain('title: Theirs');
    expect(await refusal(publishCopy(hidden.revision))).toBe('Conflict');
  });

  it('unpublishes only the file, preserving saved edits and unknown frontmatter', async () => {
    const saved = await saveTitle(
      await h.run(readCopy()),
      'Saved, not published'
    );
    const hidden = await h.run(visibility(saved, 'draft'));

    expect(await unpublished()).toBe(true);
    expect(hidden).toMatchObject({
      dirty: true,
      changedOutside: false,
      data: { title: 'Saved, not published' }
    });
    expect(await h.file('blog/hello.md')).toContain('title: Hello');
    expect(await h.file('blog/hello.md')).toContain('draft: true');
    expect(await h.file('blog/hello.md')).toContain('custom: keep-me');

    const live = await h.run(visibility(hidden, 'published'));

    expect(await titleOnSite()).toBe('Hello');
    expect(live.dirty).toBe(true);
    await h.run(publishCopy(live.revision));
    expect(await titleOnSite()).toBe('Saved, not published');
  });

  it('refuses a stale file SHA, and performs no duplicate unpublish', async () => {
    const copy = await h.run(readCopy());

    await h.outside('blog/hello.md', post('Changed elsewhere'));

    const refused = await failed(visibility(copy, 'draft'));

    expect(Result.isFailure(refused) && refused.failure).toBeInstanceOf(
      Conflict
    );
    expect(await unpublished()).toBe(false);

    const hidden = await h.run(visibility(await h.run(readCopy()), 'draft'));

    await h.run(visibility(hidden, 'draft'));
    expect(await h.revisions()).toHaveLength(2);
  });
});

describe('trash', () => {
  it('keeps edits and ownership, and reserves the slug while trashed', async () => {
    const copy = await h.run(readCopy());
    const owned = await h.run(assignOwner(copy.revision, author));
    const saved = await saveTitle(owned, 'My saved work', author);
    const gone = await h.run(trash(saved, author));
    const recreate = writeFiles(
      [{ path: 'blog/hello.mdx', text: post('Replacement'), baseSha: null }],
      { author: { id: null, name: 'Agent' }, message: 'Re', mode: 'strict' }
    );

    expect(await h.file('blog/hello.md')).toBeUndefined();
    expect(gone).toMatchObject({
      ownerId: author,
      hasChanges: true,
      canRestore: true
    });
    expect(await refusal(readCopy(author))).toBe('EntryTrashed');
    expect(await refusal(createCopy('hello', { title: 'Replacement' }))).toBe(
      'SlugTaken'
    );
    expect(await refusal(recreate)).toBe('EntryTrashed');
  });

  it('allows only editors and the owning author to manage state and trash', async () => {
    const copy = await h.run(readCopy());
    const owned = await h.run(assignOwner(copy.revision, contributor));

    expect(await refusal(trash(owned, contributor))).toBe('Forbidden');
    expect(await refusal(visibility(owned, 'draft', other))).toBe('Forbidden');

    const gone = await h.run(trash(owned, editor));

    expect((await h.run(bin(contributor))).items[0]?.canRestore).toBe(false);
    expect((await h.run(bin(other))).items).toEqual([]);
    expect(await refusal(restore(gone.revision, contributor))).toBe(
      'Forbidden'
    );
  });
});

describe('restoration', () => {
  it('restores as a draft with the saved edit, and an old tab stays stale', async () => {
    const copy = await h.run(readCopy());
    const owned = await h.run(assignOwner(copy.revision, author));
    const saved = await saveTitle(owned, 'My saved work', author);
    const gone = await h.run(trash(saved, author));
    const restored = await h.run(restore(gone.revision, author));

    expect(restored).toMatchObject({
      ownerId: author,
      dirty: true,
      changedOutside: false,
      data: { title: 'My saved work' }
    });
    expect(await unpublished()).toBe(true);
    expect(await h.file('blog/hello.md')).toContain('title: Hello');
    expect(await h.file('blog/hello.md')).toContain('draft: true');
    expect((await h.run(bin())).items).toEqual([]);
    expect(await refusal(saveCopy(saved.revision, saved.data, author))).toBe(
      'EditedElsewhere'
    );
    await h.run(publishCopy(restored.revision, author));
    expect(await titleOnSite()).toBe('My saved work');
  });

  it('restores a clean file as a clean draft that can be republished', async () => {
    const gone = await h.run(trash(await h.run(readCopy())));
    const restored = await h.run(restore(gone.revision));

    expect(restored.dirty).toBe(false);
    await h.run(visibility(restored, 'published'));
    expect(await titleOnSite()).toBe('Hello');
    expect(await h.revisions()).toHaveLength(3);
  });
});

describe('competing lifecycle actions', () => {
  it('one of two trash requests wins, and one of two restores wins', async () => {
    const copy = await h.run(readCopy());
    const both = await Promise.all([
      failed(trash(copy)),
      failed(trash(copy, editor))
    ]);

    expect(both.filter(Result.isSuccess)).toHaveLength(1);
    expect(await h.revisions()).toHaveLength(1);

    const gone = (await h.run(bin())).items[0];
    const restores = await Promise.all([
      failed(restore(gone?.revision ?? -1)),
      failed(restore(gone?.revision ?? -1, editor))
    ]);

    expect(restores.filter(Result.isSuccess)).toHaveLength(1);
    expect(await h.revisions()).toHaveLength(2);
    expect(await unpublished()).toBe(true);
  });

  it('a save during trash refuses trash without losing the save', async () => {
    const copy = await h.run(readCopy());
    const raced = beforeBatch(
      trash(copy),
      saveCopy(copy.revision, { ...copy.data, title: 'Saved during trash' })
    );

    expect(await refusal(raced)).toBe('EditedElsewhere');
    expect(await h.file('blog/hello.md')).toBe(post('Hello'));
    expect((await h.run(readCopy())).data.title).toBe('Saved during trash');
    expect((await h.run(bin())).items).toEqual([]);
  });

  it('a trash racing a publish makes exactly one file revision', async () => {
    const saved = await saveTitle(await h.run(readCopy()), 'About to publish');
    const [trashed, published] = await Promise.all([
      failed(trash(saved)),
      failed(publishCopy(saved.revision))
    ]);

    expect(
      Number(Result.isSuccess(trashed)) + Number(Result.isSuccess(published))
    ).toBe(1);
    expect(await h.revisions()).toHaveLength(1);
  });
});

describe('lifecycle actions racing a model change', () => {
  it('refuses a visibility change if its model changed during the batch', async () => {
    const copy = await h.run(readCopy());
    const raced = await failed(
      beforeBatch(visibility(copy, 'draft'), renamed())
    );

    expect(failureTag(raced)).toBe('Conflict');
    expect(Result.isFailure(raced) && raced.failure).toMatchObject({
      path: 'blog/config.ts'
    });
    expect(await unpublished()).toBe(false);
  });

  it('a model edit cannot reindex the snapshot from before an unpublish', async () => {
    const copy = await h.run(readCopy());

    await h.run(beforeBatch(renamed(), visibility(copy, 'draft')));
    expect(await unpublished()).toBe(true);
    expect(await h.file('blog/hello.md')).toContain('draft: true');
    expect(await h.revisions()).toHaveLength(2);
  });

  it('a model edit cannot reintroduce a trashed entry into the index', async () => {
    const copy = await h.run(readCopy());

    await h.run(beforeBatch(renamed(), trash(copy)));
    expect(await unpublished()).toBe(true);
    expect(await h.file('blog/hello.md')).toBeUndefined();
    expect((await h.run(bin())).items).toHaveLength(1);
  });

  it('a model change during restore refuses content that no longer fits', async () => {
    const gone = await h.run(trash(await h.run(readCopy())));
    const raced = beforeBatch(
      restore(gone.revision),
      config(BLOG.replace('max: 40', 'max: 3'))
    );

    expect(await refusal(raced)).toBe('InvalidContent');
    expect(await h.file('blog/hello.md')).toBeUndefined();
    expect((await h.run(bin())).items).toHaveLength(1);
  });
});
