import { ContentReadOnly } from '@venda/contract';
import { Effect, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AtomicWrites, AtomicWriteError } from '../src/database';
import { ContentStore, getPublished, syncAll } from '../src/content';
import {
  assignOwner,
  contributor,
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

it('publishes canonical bytes, preserves unknown frontmatter, and indexes without sync', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Published edit' })
  );
  const published = await h.run(publishCopy(saved.revision));

  expect(published).toMatchObject({
    dirty: false,
    publishing: false,
    changedOutside: false
  });
  expect(h.files.get('blog/hello.md')).toContain('custom: keep-me');
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe(
    'Published edit'
  );
  expect(
    Result.isFailure(
      await h.run(Effect.result(saveCopy(saved.revision, saved.data)))
    )
  ).toBe(true);
});

it('refuses incomplete required fields and contributor publishing', async () => {
  const copy = await h.run(readCopy());
  const owned = await h.run(assignOwner(copy.revision, contributor));
  const saved = await h.run(
    saveCopy(owned.revision, { title: '' }, contributor)
  );

  expect(
    Result.isFailure(await h.run(Effect.result(publishCopy(saved.revision))))
  ).toBe(true);
  expect(
    Result.isFailure(
      await h.run(Effect.result(publishCopy(saved.revision, contributor)))
    )
  ).toBe(true);
  expect(h.files.get('blog/hello.md')).toBe(post('Hello'));
});

it('keeps work on outside changes; rebase acknowledges the exact new SHA', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Mine' })
  );

  h.files.set('blog/hello.md', post('Outside'));

  expect(
    Result.isFailure(await h.run(Effect.result(publishCopy(saved.revision))))
  ).toBe(true);
  expect(h.files.get('blog/hello.md')).toBe(post('Outside'));

  const conflict = await h.run(readCopy());

  expect(conflict).toMatchObject({
    dirty: true,
    changedOutside: true,
    data: { title: 'Mine' }
  });
  expect(
    Result.isFailure(
      await h.run(
        Effect.result(rebaseCopy(conflict.revision, copy.baseSha ?? ''))
      )
    )
  ).toBe(true);

  const rebased = await h.run(
    rebaseCopy(conflict.revision, conflict.currentSha ?? '')
  );

  expect((await h.run(publishCopy(rebased.revision))).dirty).toBe(false);
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe('Mine');
});

it('resumes the same durable intent after a store wrote but its response was lost', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Resumed' })
  );

  h.uncertain();

  expect(
    Result.isFailure(await h.run(Effect.result(publishCopy(saved.revision))))
  ).toBe(true);
  expect((await h.run(readCopy())).publishing).toBe(true);
  expect(
    Result.isFailure(
      await h.run(Effect.result(saveCopy(saved.revision, saved.data)))
    )
  ).toBe(true);
  expect((await h.run(publishCopy(saved.revision))).publishing).toBe(false);
});

it('keeps a durable intent when the atomic index finalization fails', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Retry index' })
  );
  const failed = await h.run(
    Effect.result(
      publishCopy(saved.revision).pipe(
        Effect.provideService(AtomicWrites, {
          run: () => Effect.fail(new AtomicWriteError({ cause: 'test outage' }))
        })
      )
    )
  );

  expect(Result.isFailure(failed)).toBe(true);
  expect((await h.run(readCopy())).publishing).toBe(true);
  expect((await h.run(publishCopy(saved.revision))).dirty).toBe(false);
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe(
    'Retry index'
  );
});

it('a bundled store refuses publication but still permits working copies', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Save offline' })
  );
  const result = await h.run(
    Effect.result(
      Effect.gen(function* () {
        const store = yield* ContentStore;

        return yield* publishCopy(saved.revision).pipe(
          Effect.provideService(ContentStore, {
            ...store,
            writable: false,
            commit: () => Effect.fail(new ContentReadOnly())
          })
        );
      })
    )
  );

  expect(Result.isFailure(result)).toBe(true);
  expect((await h.run(readCopy())).dirty).toBe(true);
});

it('finishes an uncertain publish after a model change without indexing invalid fields', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Long title' })
  );

  h.uncertain();
  await h.run(Effect.result(publishCopy(saved.revision)));
  h.files.set(
    'blog/config.ts',
    (h.files.get('blog/config.ts') ?? '').replace('max: 40', 'max: 3')
  );
  await h.run(syncAll());

  const published = await h.run(publishCopy(saved.revision));

  expect(published).toMatchObject({ dirty: false, publishing: false });
  expect(published.indexProblem).toBeTruthy();
  expect(
    Result.isFailure(await h.run(Effect.result(getPublished('blog', 'hello'))))
  ).toBe(true);
});

it('never recreates a file deleted outside Venda, and keeps the copy flagged', async () => {
  const copy = await h.run(readCopy());
  const saved = await h.run(
    saveCopy(copy.revision, { ...copy.data, title: 'Keep my work' })
  );

  h.files.delete('blog/hello.md');

  expect(
    Result.isFailure(await h.run(Effect.result(publishCopy(saved.revision))))
  ).toBe(true);
  expect(h.files.has('blog/hello.md')).toBe(false);
  expect(await h.run(readCopy())).toMatchObject({
    dirty: true,
    changedOutside: true,
    currentSha: null
  });
});
