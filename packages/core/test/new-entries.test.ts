import { name } from '@gdp-ts/core';
import { Effect, Result } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { canBrowseContent } from '../src/auth';
import { getPublished, listIndexedEntries } from '../src/content';
import {
  author,
  contributor,
  createCopy,
  discardCopy,
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

const browse = (
  id: typeof author,
  query: { cursor?: string; q?: string } = {}
) =>
  name(id, user =>
    Effect.flatMap(canBrowseContent(user), proof =>
      listIndexedEntries(user, 'blog', query, proof)
    )
  );

it('pages through every new entry before the files, including more than fifty drafts', async () => {
  for (let index = 0; index < 51; index++)
    await h.run(
      createCopy(`new-${index}`, { title: `Draft ${index}` }, author)
    );

  const first = await h.run(browse(author));
  const second = await h.run(
    browse(author, { cursor: first.nextCursor ?? '' })
  );
  const third = await h.run(
    browse(author, { cursor: second.nextCursor ?? '' })
  );
  const all = [...first.items, ...second.items, ...third.items];

  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(1);
  expect(all.filter(entry => entry.copy === 'new')).toHaveLength(51);
  expect(new Set(all.map(entry => entry.slug)).size).toBe(53);
  expect(third.nextCursor).toBeNull();
  expect(
    (await h.run(browse(author, { q: 'Draft 0' }))).items.map(
      entry => entry.slug
    )
  ).toEqual(['new-0']);
});

it('does not persist an oversized creation payload', async () => {
  const oversized = await h.run(
    Effect.result(
      createCopy('huge', {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'x'.repeat(1_048_576) }]
            }
          ]
        }
      })
    )
  );

  expect(Result.isFailure(oversized) && oversized.failure._tag).toBe(
    'ContentTooLarge'
  );
  expect(
    (await h.run(browse(author))).items.some(entry => entry.slug === 'huge')
  ).toBe(false);
});

it('recreating a discarded slug never reuses its old revision', async () => {
  const first = await h.run(createCopy('again', { title: 'First' }, author));

  await h.run(discardCopy(first.revision, author, entryRef('again')));

  const next = await h.run(createCopy('again', { title: 'New entry' }, author));
  const stale = await h.run(
    Effect.result(
      saveCopy(first.revision, { title: 'Old tab' }, author, entryRef('again'))
    )
  );

  expect(next.revision).toBeGreaterThan(first.revision);
  expect(Result.isFailure(stale) && stale.failure._tag).toBe('EditedElsewhere');
  expect((await h.run(readCopy(author, entryRef('again')))).data.title).toBe(
    'New entry'
  );
});

it('starts a new entry as its creator’s copy, publishes it to a new file and indexes it', async () => {
  const copy = await h.run(createCopy('autumn', { title: 'Autumn' }, author));

  expect(copy).toMatchObject({ baseSha: null, dirty: true, ownerId: author });
  expect(h.files.has('blog/autumn.md')).toBe(false);
  expect((await h.run(browse(author))).items[0]).toMatchObject({
    slug: 'autumn',
    copy: 'new'
  });
  expect(
    (await h.run(browse(other))).items.map(item => item.slug)
  ).not.toContain('autumn');

  const body = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Leaves.' }] }
    ]
  };
  const saved = await h.run(
    saveCopy(
      copy.revision,
      { title: 'Autumn', body },
      author,
      entryRef('autumn')
    )
  );
  const published = await h.run(
    publishCopy(saved.revision, author, entryRef('autumn'))
  );

  expect(published).toMatchObject({ dirty: false, changedOutside: false });
  expect(h.files.get('blog/autumn.md')).toContain('title: Autumn');
  expect((await h.run(getPublished('blog', 'autumn'))).data.title).toBe(
    'Autumn'
  );
});

it('refuses a taken or malformed slug, and never overwrites a file that appears meanwhile', async () => {
  const taken = await h.run(
    Effect.result(createCopy('hello', { title: 'Again' }))
  );
  const malformed = await h.run(Effect.result(createCopy('Not A Slug', {})));

  expect(Result.isFailure(taken) && taken.failure._tag).toBe('SlugTaken');
  expect(Result.isFailure(malformed) && malformed.failure._tag).toBe(
    'InvalidContent'
  );

  const copy = await h.run(
    createCopy('race', { title: 'Mine', body: { type: 'doc', content: [] } })
  );

  h.files.set('blog/race.md', post('Pushed by an agent'));

  expect(
    Result.isFailure(
      await h.run(
        Effect.result(publishCopy(copy.revision, undefined, entryRef('race')))
      )
    )
  ).toBe(true);
  expect(h.files.get('blog/race.md')).toBe(post('Pushed by an agent'));
});

it('discarding a new entry removes it, and a contributor’s entry waits for an editor', async () => {
  const draft = await h.run(createCopy('scrap', { title: 'Scrap' }));

  expect(
    await h.run(discardCopy(draft.revision, undefined, entryRef('scrap')))
  ).toBeNull();
  expect(
    Result.isFailure(
      await h.run(Effect.result(readCopy(undefined, entryRef('scrap'))))
    )
  ).toBe(true);

  const pending = await h.run(
    createCopy('pending', { title: 'Pending' }, contributor)
  );

  expect(pending.canPublish).toBe(false);
  expect(
    Result.isFailure(
      await h.run(
        Effect.result(
          publishCopy(pending.revision, contributor, entryRef('pending'))
        )
      )
    )
  ).toBe(true);
});
