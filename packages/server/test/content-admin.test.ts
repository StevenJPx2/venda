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
        `/admin/collections/blog/entries?cursor=${first.nextCursor}`,
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
  expect(first.items.map(entry => entry.state)).toContain('draft');
  expect(first.items.map(entry => entry.state)).toContain('future');
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
