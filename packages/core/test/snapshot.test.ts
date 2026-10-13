import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { gitBlobSha, snapshotOf } from '../src/content';

it('reads the same bytes it hashed, even after the source changes', async () => {
  const source = new Map([['blog/hello.md', 'before']]);
  const snapshot = await Effect.runPromise(snapshotOf(source));

  source.set('blog/hello.md', 'after');

  expect(await Effect.runPromise(snapshot.read('blog/hello.md'))).toBe(
    'before'
  );
  expect(snapshot.files).toEqual([
    {
      path: 'blog/hello.md',
      sha: await gitBlobSha(new TextEncoder().encode('before')),
      size: 6
    }
  ]);
});

it('fails a read for a file the snapshot does not hold', async () => {
  const snapshot = await Effect.runPromise(snapshotOf(new Map()));
  const read = await Effect.runPromise(
    Effect.result(snapshot.read('blog/missing.md'))
  );

  expect(read._tag).toBe('Failure');
});
