import { Effect, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AtomicWrites, AtomicWriteError } from '../src/database';
import { getPublished } from '../src/content';
import {
  assignOwner,
  BLOG,
  contributor,
  editor,
  post,
  publishCopy,
  readCopy,
  rebaseCopy,
  saveCopy,
  writeHarness
} from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

const failed = async <A, E>(work: Promise<Result.Result<A, E>>) =>
  Result.isFailure(await work);

it('publishes canonical bytes, keeps unknown frontmatter, indexes them and records a revision', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Published edit' })
  );
  const published = await h.run(publishCopy(saved.revision));

  expect(published).toMatchObject({ dirty: false, changedOutside: false });
  expect(await h.file('blog/hello.md')).toContain('custom: keep-me');
  expect(await h.revisions()).toEqual([
    { path: 'blog/hello.md', message: 'Publish blog/hello', author: 'admin' }
  ]);
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe(
    'Published edit'
  );
  expect(
    await failed(h.run(Effect.result(saveCopy(saved.revision, saved.data))))
  ).toBe(true);
});

it('refuses incomplete required fields and contributor publishing', async () => {
  const copy = await h.run(readCopy());
  const owned = await h.run(assignOwner(copy.revision, contributor));
  const saved = await h.run(
    saveCopy(owned.revision, { title: '' }, contributor)
  );

  expect(await failed(h.run(Effect.result(publishCopy(saved.revision))))).toBe(
    true
  );
  expect(
    await failed(h.run(Effect.result(publishCopy(saved.revision, contributor))))
  ).toBe(true);
  expect(await h.file('blog/hello.md')).toBe(post('Hello'));
});

it('keeps work on outside changes; rebase acknowledges the exact new SHA', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Mine' })
  );

  await h.outside('blog/hello.md', post('Outside'));

  expect(await failed(h.run(Effect.result(publishCopy(saved.revision))))).toBe(
    true
  );
  expect(await h.file('blog/hello.md')).toBe(post('Outside'));

  const conflict = await h.run(readCopy());

  expect(conflict).toMatchObject({
    dirty: true,
    changedOutside: true,
    data: { title: 'Mine' }
  });
  expect(
    await failed(
      h.run(Effect.result(rebaseCopy(conflict.revision, copy.baseSha ?? '')))
    )
  ).toBe(true);

  const rebased = await h.run(
    rebaseCopy(conflict.revision, conflict.currentSha ?? '')
  );

  expect((await h.run(publishCopy(rebased.revision))).dirty).toBe(false);
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe('Mine');
});

it('writes nothing when the batch fails: the copy stays, and publishing again works', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'After an outage' })
  );
  const outage = await h.run(
    Effect.result(
      publishCopy(saved.revision).pipe(
        Effect.provideService(AtomicWrites, {
          run: () => Effect.fail(new AtomicWriteError({ cause: 'test outage' }))
        })
      )
    )
  );

  expect(Result.isFailure(outage)).toBe(true);
  expect(await h.file('blog/hello.md')).toBe(post('Hello'));
  expect(await h.revisions()).toEqual([]);
  expect((await h.run(readCopy())).dirty).toBe(true);
  expect((await h.run(publishCopy(saved.revision, editor))).dirty).toBe(false);
  expect(await h.revisions()).toEqual([
    { path: 'blog/hello.md', message: 'Publish blog/hello', author: 'editor' }
  ]);
});

it('one copy published twice at once makes one revision; the other is told it was edited', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Pressed twice' })
  );
  const both = await Promise.all([
    h.run(Effect.result(publishCopy(saved.revision))),
    h.run(Effect.result(publishCopy(saved.revision, editor)))
  ]);

  expect(both.filter(Result.isSuccess)).toHaveLength(1);
  expect(await h.revisions()).toHaveLength(1);
  expect(await h.file('blog/hello.md')).toContain('title: Pressed twice');
});

it('publishes against the model as it is now: a stricter model refuses it', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Long title' })
  );

  await h.outside('blog/config.ts', BLOG.replace('max: 40', 'max: 3'));

  expect(await failed(h.run(Effect.result(publishCopy(saved.revision))))).toBe(
    true
  );
  expect(await h.file('blog/hello.md')).toBe(post('Hello'));
});

it('never recreates a file deleted outside Venda, and keeps the copy flagged', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Keep my work' })
  );

  await h.outside('blog/hello.md', null);

  expect(await failed(h.run(Effect.result(publishCopy(saved.revision))))).toBe(
    true
  );
  expect(await h.file('blog/hello.md')).toBeUndefined();
  expect(await h.run(readCopy())).toMatchObject({
    dirty: true,
    changedOutside: true,
    currentSha: null
  });
});
