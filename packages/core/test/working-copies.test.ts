import { Effect, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  assignOwner,
  author,
  contributor,
  discardCopy,
  editor,
  other,
  readCopy,
  saveCopy,
  publishCopy,
  writeHarness
} from './write-support';
import { Database } from '../src/database';
import { users } from '../src/auth/schema';
import { eq } from 'drizzle-orm';
import { name } from '@gdp-ts/core';
import { canBrowseContent } from '../src/auth';
import { listIndexedEntries, syncAll } from '../src/content';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

it('editors publish unowned entries, while disabling them revokes their proof', async () => {
  const copy = await h.run(readCopy(editor));
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'By an editor' }, editor)
  );

  expect((await h.run(publishCopy(saved.revision, editor))).dirty).toBe(false);

  await h.run(
    Effect.flatMap(Database, db =>
      db.update(users).set({ status: 'disabled' }).where(eq(users.id, editor))
    )
  );

  expect(Result.isFailure(await h.run(Effect.result(readCopy(editor))))).toBe(
    true
  );
  expect(
    Result.isFailure(
      await h.run(Effect.result(publishCopy(saved.revision, editor)))
    )
  ).toBe(true);
});

it('authors and contributors browse owned file drafts, without seeing somebody else’s drafts', async () => {
  h.files.set(
    'blog/hello.md',
    (h.files.get('blog/hello.md') ?? '').replace(
      'title: Hello',
      'title: Hello\ndraft: true'
    )
  );
  await h.run(syncAll());

  const copy = await h.run(readCopy());

  await h.run(assignOwner(copy.revision, contributor));

  const browse = (id: typeof contributor) =>
    name(id, user =>
      Effect.flatMap(canBrowseContent(user), proof =>
        listIndexedEntries(user, 'blog', {}, proof)
      )
    );

  expect(
    (await h.run(browse(contributor))).items.map(item => item.slug)
  ).toContain('hello');
  expect(
    (await h.run(browse(other))).items.map(item => item.slug)
  ).not.toContain('hello');
});

it('saves a shared copy without touching its file or public content', async () => {
  const file = h.files.get('blog/hello.md');
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'My edit' })
  );

  expect(saved).toMatchObject({
    dirty: true,
    revision: copy.revision + 1,
    data: { title: 'My edit' }
  });
  expect(h.files.get('blog/hello.md')).toBe(file);
  expect((await h.run(readCopy())).data.title).toBe('My edit');
});

it('only one save at a revision wins; discard raises the revision too', async () => {
  const copy = await h.run(readCopy());
  const results = await Promise.all([
    h.run(
      Effect.result(saveCopy(copy.revision, { ...copy.data, title: 'One' }))
    ),
    h.run(
      Effect.result(saveCopy(copy.revision, { ...copy.data, title: 'Two' }))
    )
  ]);

  expect(results.filter(Result.isSuccess)).toHaveLength(1);
  expect(results.filter(Result.isFailure)).toHaveLength(1);

  const current = await h.run(readCopy());
  const clean = await h.run(discardCopy(current.revision));

  expect(clean).toMatchObject({ dirty: false, data: { title: 'Hello' } });
  expect(clean.revision).toBeGreaterThan(current.revision);
  expect(
    Result.isFailure(
      await h.run(Effect.result(saveCopy(copy.revision, copy.data)))
    )
  ).toBe(true);
});

it('validates types and documents before serialization, but allows unfinished required fields', async () => {
  const copy = await h.run(readCopy());
  const wrong = await h.run(
    Effect.result(saveCopy(copy.revision, { title: 42 }))
  );
  const doc = await h.run(
    Effect.result(saveCopy(copy.revision, { body: { type: 'bad' } }))
  );

  expect(Result.isFailure(wrong)).toBe(true);
  expect(Result.isFailure(doc)).toBe(true);
  expect(
    Result.isFailure(
      await h.run(
        Effect.result(saveCopy(copy.revision, { constructor: 'unknown field' }))
      )
    )
  ).toBe(true);
  expect((await h.run(saveCopy(copy.revision, { title: '' }))).dirty).toBe(
    true
  );
});

it('only editors assign owners; authors and contributors edit their own copy', async () => {
  expect(Result.isFailure(await h.run(Effect.result(readCopy(author))))).toBe(
    true
  );

  const copy = await h.run(readCopy());
  const owned = await h.run(assignOwner(copy.revision, author));

  expect((await h.run(readCopy(author))).ownerId).toBe(author);
  expect(Result.isFailure(await h.run(Effect.result(readCopy(other))))).toBe(
    true
  );
  expect(
    Result.isFailure(
      await h.run(Effect.result(assignOwner(owned.revision, other, author)))
    )
  ).toBe(true);

  const reassigned = await h.run(assignOwner(owned.revision, contributor));

  expect(
    Result.isFailure(
      await h.run(Effect.result(saveCopy(reassigned.revision, {}, author)))
    )
  ).toBe(true);
  expect(
    (
      await h.run(
        saveCopy(reassigned.revision, { title: 'Pending review' }, contributor)
      )
    ).dirty
  ).toBe(true);
});
