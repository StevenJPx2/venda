import { name } from '@gdp-ts/core';
import { Effect } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { canBrowseContent } from '../src/auth';
import { contentSchema, listTrash } from '../src/content';
import { Database } from '../src/database';
import { admin, writeHarness } from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

it('pages trash with a stable tie-breaker and no duplicate or skipped entries', async () => {
  await h.run(
    Effect.flatMap(Database, db =>
      db.insert(contentSchema.contentWork).values(
        Array.from({ length: 51 }, (_, index) => ({
          collection: 'blog',
          slug: `gone-${index}`,
          path: `blog/gone-${index}.md`,
          status: 'trashed' as const,
          trashSha: 'a'.repeat(40),
          trashedAt: '2026-10-13T00:00:00Z',
          trashedBy: admin,
          dataJson: JSON.stringify({ title: `Gone ${index}` }),
          extraJson: '{}'
        }))
      )
    )
  );

  const page = (cursor?: string) =>
    h.run(
      name(admin, user =>
        Effect.flatMap(canBrowseContent(user), proof =>
          listTrash(user, cursor, proof)
        )
      )
    );
  const first = await page();
  const second = await page(first.nextCursor ?? undefined);

  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.items, ...second.items].map(item => item.slug)).size
  ).toBe(51);
  expect((await page('tampered')).items.map(item => item.slug)).toEqual(
    first.items.map(item => item.slug)
  );
});
