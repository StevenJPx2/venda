import {
  CollectionSummary,
  ContentProblem,
  CreatedInvitation,
  EntryPage
} from '@venda/contract';
import { Schema } from 'effect';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import { expect, it } from 'vitest';
import { OWNER, startApp } from './support';

async function seedFiles() {
  const files = createStorage({ driver: memoryDriver() });

  await files.setItemRaw(
    'blog/config.ts',
    "export default defineCollection({ name: 'Blog', kind: 'posts', fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } } });"
  );

  for (let index = 0; index < 52; index++)
    await files.setItemRaw(
      `blog/post-${String(index).padStart(2, '0')}.md`,
      `---\ntitle: Post ${index}\n---\n\nBody.`
    );

  await files.setItemRaw(
    'blog/draft.md',
    '---\ntitle: Secret\ndraft: true\n---\n'
  );
  await files.setItemRaw(
    'blog/future.md',
    '---\ntitle: Future\npublishedAt: 2999-01-01T00:00:00Z\n---\n'
  );
  await files.setItemRaw('blog/broken.md', '---\ndraft: false\n---\n');

  return files;
}

async function startContentApp() {
  const { app } = await startApp(await seedFiles());

  const request = (
    path: string,
    cookie = '',
    method = 'GET',
    body?: Schema.Json
  ) => {
    const init: RequestInit = {
      method,
      headers: { cookie, 'content-type': 'application/json' }
    };

    if (body !== undefined) init.body = JSON.stringify(body);

    return app.fetch(new Request(`http://venda.test/api${path}`, init));
  };

  const login = async (email: string, password: string) =>
    (await request('/auth/sign-in', '', 'POST', { email, password })).headers
      .getSetCookie()[0]
      ?.split(';')[0] ?? '';

  return { request, login };
}

it('protects file drafts and problems, and pages entries', async () => {
  const { request, login } = await startContentApp();

  expect((await request('/admin/collections')).status).toBe(401);

  const owner = await login(OWNER.email, OWNER.password);
  const models = Schema.decodeUnknownSync(Schema.Array(CollectionSummary))(
    await (await request('/admin/collections', owner)).json()
  );
  const problems = Schema.decodeUnknownSync(Schema.Array(ContentProblem))(
    await (await request('/admin/content-problems', owner)).json()
  );
  const first = Schema.decodeUnknownSync(EntryPage)(
    await (await request('/admin/collections/blog/entries', owner)).json()
  );
  const second = Schema.decodeUnknownSync(EntryPage)(
    await (
      await request(
        `/admin/collections/blog/entries?cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
        owner
      )
    ).json()
  );

  expect(models[0]).toMatchObject({
    name: 'Blog',
    titleField: 'title',
    bodyField: 'body'
  });
  expect(problems.map(problem => problem.path)).toEqual(['blog/broken.md']);
  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(4);
  expect(second.nextCursor).toBeNull();
  // Posts: the draft, then the newest date (the future one), then undated by slug.
  expect(first.items.slice(0, 3).map(entry => entry.slug)).toEqual([
    'draft',
    'future',
    'post-00'
  ]);
  expect(
    [...first.items, ...second.items].slice(2).map(entry => entry.slug)
  ).toEqual(
    Array.from(
      { length: 52 },
      (_, index) => `post-${String(index).padStart(2, '0')}`
    )
  );
});

it('orders entries by kind: posts newest first, pages A to Z by title', async () => {
  const files = createStorage({ driver: memoryDriver() });
  const fields =
    "fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } }";

  await files.setItemRaw(
    'journal/config.ts',
    `export default defineCollection({ name: 'Journal', kind: 'posts', ${fields} });`
  );
  await files.setItemRaw(
    'about/config.ts',
    `export default defineCollection({ name: 'About', kind: 'pages', ${fields} });`
  );

  for (const [slug, date] of [
    ['january', '2026-01-15T09:00:00Z'],
    ['march', '2026-03-15T09:00:00Z'],
    ['february', '2026-02-15T09:00:00Z']
  ] as const)
    await files.setItemRaw(
      `journal/${slug}.md`,
      `---\ntitle: ${slug}\npublishedAt: ${date}\n---\n`
    );

  await files.setItemRaw('journal/idea.md', '---\ndraft: true\n---\n');

  for (const [slug, title] of [
    ['z', 'Zebra'],
    ['a', 'apple'],
    ['m', 'Mango']
  ] as const)
    await files.setItemRaw(`about/${slug}.md`, `---\ntitle: ${title}\n---\n`);

  const { app } = await startApp(files);
  const cookie =
    (
      await app.fetch(
        new Request('http://venda.test/api/auth/sign-in', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(OWNER)
        })
      )
    ).headers
      .getSetCookie()[0]
      ?.split(';')[0] ?? '';
  const slugs = async (collection: string) =>
    Schema.decodeUnknownSync(EntryPage)(
      await (
        await app.fetch(
          new Request(
            `http://venda.test/api/admin/collections/${collection}/entries`,
            { headers: { cookie } }
          )
        )
      ).json()
    ).items.map(entry => entry.slug);

  expect(await slugs('journal')).toEqual([
    'idea',
    'march',
    'february',
    'january'
  ]);
  expect(await slugs('about')).toEqual(['a', 'm', 'z']);
});

it('limits authors to published entries and searches them', async () => {
  const { request, login } = await startContentApp();
  const owner = await login(OWNER.email, OWNER.password);
  const created = Schema.decodeUnknownSync(CreatedInvitation)(
    await (
      await request('/invitations', owner, 'POST', {
        email: 'author@venda.test',
        role: 'author'
      })
    ).json()
  );

  await request(`/join/${created.token}`, '', 'POST', {
    name: 'Author',
    password: 'a long password'
  });

  const author = await login('author@venda.test', 'a long password');
  const page = Schema.decodeUnknownSync(EntryPage)(
    await (await request('/admin/collections/blog/entries', author)).json()
  );
  const search = Schema.decodeUnknownSync(EntryPage)(
    await (
      await request('/admin/collections/blog/entries?q=Post%2051', author)
    ).json()
  );

  expect(page.items.every(entry => entry.state === 'published')).toBe(true);
  expect(search.items.map(entry => entry.slug)).toEqual(['post-51']);
  expect((await request('/admin/content-problems', author)).status).toBe(403);
  expect(
    (await request('/admin/collections/blog/entries/draft', author)).status
  ).toBe(404);
  expect(
    (await request('/admin/collections/blog/entries/draft', owner)).status
  ).toBe(200);
});
