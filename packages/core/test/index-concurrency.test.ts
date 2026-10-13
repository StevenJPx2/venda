import { Conflict } from '@venda/contract';
import { Effect, Option, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getPublished } from '../src/content';
import { fileAt, writeFiles } from '../src/content/files';
import { AtomicWrites } from '../src/database';
import { post, writeHarness } from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

it('retries an index race at most twice and never partially writes the requested file', async () => {
  let attempts = 0;
  const raced = await h.run(
    Effect.gen(function* () {
      const original = yield* AtomicWrites;
      const hello = Option.getOrThrow(yield* fileAt('blog/hello.md'));

      return yield* Effect.result(
        writeFiles(
          [
            {
              path: 'blog/hello.md',
              text: post('Wanted'),
              baseSha: hello.sha
            }
          ],
          {
            author: { id: null, name: 'First writer' },
            message: 'Wanted',
            mode: 'strict'
          }
        ).pipe(
          Effect.provideService(AtomicWrites, {
            run: statements =>
              Effect.gen(function* () {
                attempts++;

                const second = Option.getOrThrow(
                  yield* fileAt('blog/second.md')
                );

                yield* writeFiles(
                  [
                    {
                      path: 'blog/second.md',
                      text: post(`Competing ${attempts}`),
                      baseSha: second.sha
                    }
                  ],
                  {
                    author: { id: null, name: 'Other writer' },
                    message: 'Competing',
                    mode: 'strict'
                  }
                ).pipe(
                  Effect.provideService(AtomicWrites, original),
                  Effect.orDie
                );
                yield* original.run(statements);
              })
          })
        )
      );
    })
  );

  expect(attempts).toBe(3);
  expect(Result.isFailure(raced) && raced.failure).toEqual(
    new Conflict({
      path: 'blog/second.md',
      sha: Option.getOrThrow(await h.run(fileAt('blog/second.md'))).sha
    })
  );
  expect(await h.file('blog/hello.md')).toBe(post('Hello'));
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe('Hello');
  expect(await h.revisions()).toHaveLength(3);
});

it('allows disjoint content writes to finish without duplicate revisions', async () => {
  const hello = Option.getOrThrow(await h.run(fileAt('blog/hello.md')));
  const second = Option.getOrThrow(await h.run(fileAt('blog/second.md')));
  const options = {
    author: { id: null, name: 'Writer' },
    message: 'Change',
    mode: 'strict' as const
  };
  const both = await Promise.all([
    h.run(
      Effect.result(
        writeFiles(
          [{ path: 'blog/hello.md', text: post('One'), baseSha: hello.sha }],
          options
        )
      )
    ),
    h.run(
      Effect.result(
        writeFiles(
          [{ path: 'blog/second.md', text: post('Two'), baseSha: second.sha }],
          options
        )
      )
    )
  ]);

  expect(both.every(Result.isSuccess)).toBe(true);
  expect(await h.revisions()).toHaveLength(2);
  expect((await h.run(getPublished('blog', 'hello'))).data.title).toBe('One');
  expect((await h.run(getPublished('blog', 'second'))).data.title).toBe('Two');
});
