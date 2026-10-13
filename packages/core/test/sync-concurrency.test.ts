// Sync against everything else happening at once: publishes landing while a
// pass holds an older snapshot, two runners, a runner that stalls past its
// lease, and requests arriving mid-pass. Nothing older may replace anything
// newer, and nothing asked for may be left undone.
import { Effect, Option, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  getPublished,
  requestSync,
  sourceState,
  syncAll,
  syncContent
} from '../src/content';
import { claimPass, guarded, LEASE_MS } from '../src/content/source-state';
import { AtomicWrites } from '../src/database';
import {
  createCopy,
  entryRef,
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

const title = async (slug: string) =>
  (await h.run(getPublished('blog', slug))).data.title;

/** A saved, unpublished change to hello's title; publishing it is the caller's. */
async function savedEdit(text: string) {
  const copy = await h.run(readCopy());

  return h.run(saveCopy(copy.revision, { ...copy.data, title: text }));
}

it('a pass that read before a publish never writes its older copy over it', async () => {
  const saved = await savedEdit('Published meanwhile');

  // The pass snapshots the old file; the publish lands before it writes.
  h.during(async () => {
    await h.run(publishCopy(saved.revision));
  });

  expect((await h.run(syncContent())).outcome).toBe('superseded');
  expect(await title('hello')).toBe('Published meanwhile');

  // The next pass reads the published file and settles.
  expect((await h.run(syncAll())).outcome).toBe('done');
  expect(await title('hello')).toBe('Published meanwhile');
});

it('a pass that saw no file never deletes one a publish created meanwhile', async () => {
  const created = await h.run(
    createCopy('fresh', {
      title: 'Fresh',
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }
        ]
      }
    })
  );

  h.during(async () => {
    await h.run(publishCopy(created.revision, undefined, entryRef('fresh')));
  });

  await h.run(syncContent());
  expect(await title('fresh')).toBe('Fresh');
  expect((await h.run(syncAll())).outcome).toBe('done');
  expect(await title('fresh')).toBe('Fresh');
});

it('admits one runner at a time', async () => {
  h.files.set(
    'blog/hello.md',
    h.files.get('blog/hello.md')?.replace('Hello', 'Changed') ?? ''
  );

  const outcomes = await Promise.all([
    h.run(syncContent()),
    h.run(syncContent())
  ]);

  expect(outcomes.map(report => report.outcome).sort()).toEqual([
    'busy',
    'done'
  ]);
  expect(await title('hello')).toBe('Changed');
});

it('a runner that stalls past its lease writes nothing once another took over', async () => {
  const stalled = await h.run(
    Effect.map(claimPass(Date.now() - LEASE_MS - 1), Option.getOrThrow)
  );

  // Its lease ran out, so another runner takes over and catches up.
  expect((await h.run(syncContent())).outcome).toBe('done');

  const late = await h.run(
    Effect.result(
      Effect.flatMap(AtomicWrites, atomic =>
        atomic.run(
          guarded(stalled, 'blog/hello.md', [
            {
              sql: "UPDATE content_entries SET data_json = '{}' WHERE path = ?",
              params: ['blog/hello.md']
            }
          ])
        )
      )
    )
  );

  expect(Result.isFailure(late)).toBe(true);
  expect(await title('hello')).toBe('Hello');
});

it('a runner holding a live lease turns the next one away', async () => {
  await h.run(claimPass(Date.now()));

  expect((await h.run(syncContent())).outcome).toBe('busy');
});

it('a request that arrives during a pass asks for another', async () => {
  h.during(async () => {
    await h.run(requestSync);
  });

  expect((await h.run(syncContent())).outcome).toBe('more');
  expect((await h.run(syncContent())).outcome).toBe('done');

  const state = Option.getOrThrow(await h.run(sourceState));

  expect(state.handled).toBe(state.requested);
});
