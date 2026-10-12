import { asc } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Result } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ContentStore,
  ContentStoreError,
  contentSchema,
  getPublished,
  gitBlobSha,
  listPublished,
  siteSettings,
  syncContent
} from '../src/content';
import { ContentReadOnly } from '@venda/contract';
import { Database } from '../src/database';
import { testDatabase } from './support';

const encoder = new TextEncoder();

const BLOG = `export default defineCollection({
  name: 'Blog',
  kind: 'posts',
  fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } }
});`;

const post = (title: string, extra = '') =>
  `---\ntitle: ${title}\n${extra}---\n\nHello **${title}**.\n`;

let files: Map<string, string>;

let runtime: ManagedRuntime.ManagedRuntime<ContentStore | Database, unknown>;

const store = Layer.succeed(ContentStore, {
  writable: false,
  commit: () => Effect.fail(new ContentReadOnly()),
  list: Effect.promise(() =>
    Promise.all(
      [...files].map(async ([path, text]) => ({
        path,
        sha: await gitBlobSha(encoder.encode(text))
      }))
    )
  ),
  read: path => {
    const text = files.get(path);

    return text === undefined
      ? Effect.fail(new ContentStoreError({ message: `No file ${path}` }))
      : Effect.succeed(text);
  }
});

const run = <A, E>(effect: Effect.Effect<A, E, ContentStore | Database>) =>
  runtime.runPromise(effect);

const problems = () =>
  run(
    Effect.flatMap(Database, db =>
      db
        .select({
          path: contentSchema.contentProblems.path,
          message: contentSchema.contentProblems.message,
          line: contentSchema.contentProblems.line
        })
        .from(contentSchema.contentProblems)
        .orderBy(asc(contentSchema.contentProblems.path))
    )
  );

afterEach(() => runtime.dispose());

beforeEach(() => {
  runtime = ManagedRuntime.make(Layer.mergeAll(store, testDatabase));
  files = new Map([
    ['blog/config.ts', BLOG],
    [
      'blog/hello.md',
      post('Hello', 'publishedAt: 2026-01-02T03:04:05+01:00\n')
    ],
    ['blog/older.md', post('Older', 'publishedAt: 2025-01-01T00:00:00Z\n')],
    ['blog/draft.md', '---\ndraft: true\n---\n'],
    ['blog/future.md', post('Future', 'publishedAt: 2999-01-01T00:00:00Z\n')],
    ['blog/broken.md', '---\nexcerpt: no title\n---\n\nBody\n'],
    ['README.md', 'Not content']
  ]);
});

describe('syncContent: indexing', () => {
  it('indexes valid files and records the rest as problems', async () => {
    expect(await run(syncContent())).toEqual({
      indexed: 6,
      removed: 0,
      remaining: 0,
      problems: 1
    });
    expect(await problems()).toEqual([
      {
        path: 'blog/broken.md',
        message: expect.stringMatching(/title is required/),
        line: null
      }
    ]);

    const entries = await run(listPublished('blog'));

    expect(entries.map(entry => entry.slug)).toEqual(['hello', 'older']);
    expect(entries[0]).toMatchObject({
      collection: 'blog',
      slug: 'hello',
      publishedAt: '2026-01-02T02:04:05.000Z',
      data: { title: 'Hello', body: { type: 'doc' } }
    });
  });

  it('does nothing when nothing changed, and re-reads only what did', async () => {
    await run(syncContent());

    expect(await run(syncContent())).toEqual({
      indexed: 0,
      removed: 0,
      remaining: 0,
      problems: 0
    });

    files.set('blog/hello.md', post('Changed'));
    files.delete('blog/older.md');

    expect(await run(syncContent())).toEqual({
      indexed: 1,
      removed: 1,
      remaining: 0,
      problems: 0
    });
    expect(
      (await run(listPublished('blog'))).map(entry => entry.data.title)
    ).toEqual(['Changed']);
  });

  it('works through large changes in bounded runs', async () => {
    expect(await run(syncContent(2))).toMatchObject({
      indexed: 2,
      remaining: 4
    });
    expect(await run(syncContent(2))).toMatchObject({
      indexed: 2,
      remaining: 2
    });
    expect(await run(syncContent(2))).toMatchObject({
      indexed: 2,
      remaining: 0
    });
  });
});

describe('syncContent: config and slug changes', () => {
  it('re-reads entries when their config changes, and fixes problems when files are fixed', async () => {
    await run(syncContent());

    files.set(
      'blog/config.ts',
      BLOG.replace('required: true }', 'required: true, max: 3 }')
    );

    expect(await run(syncContent())).toMatchObject({ indexed: 6, problems: 4 });
    expect((await run(listPublished('blog'))).map(entry => entry.slug)).toEqual(
      []
    );

    files.set('blog/config.ts', BLOG);
    files.set('blog/broken.md', post('Fixed'));
    await run(syncContent());

    expect(await problems()).toEqual([]);
  });

  it('drops a collection whose config breaks or goes away', async () => {
    await run(syncContent());
    files.set(
      'blog/config.ts',
      'export default defineCollection({ name: load() });'
    );
    await run(syncContent());

    expect(await problems()).toContainEqual({
      path: 'blog/config.ts',
      message: expect.stringMatching(/not plain data/),
      line: 1
    });
    expect(
      Result.isFailure(await run(Effect.result(listPublished('blog'))))
    ).toBe(true);

    files.delete('blog/config.ts');

    expect(await run(syncContent())).toMatchObject({ removed: 1 });
    expect((await problems()).map(each => each.path)).toContain(
      'blog/hello.md'
    );
  });

  it('refuses two files with one slug', async () => {
    files.set('blog/hello.mdx', post('Again'));
    await run(syncContent());

    expect((await problems()).map(each => each.message)).toContainEqual(
      expect.stringMatching(/already uses the slug "hello"/)
    );
  });
});

describe('syncContent: the site settings', () => {
  it('reads site.ts, reports it when it breaks, and forgets it when removed', async () => {
    files.set(
      'site.ts',
      "export default defineSite({ name: 'SAFT', screens: { content: 'Ours.' } });"
    );
    await run(syncContent());

    expect(await run(siteSettings)).toEqual({
      name: 'SAFT',
      screens: { content: 'Ours.' }
    });

    files.set('site.ts', "export default defineSite({ url: 'saft.org' });");
    await run(syncContent());

    expect(await run(siteSettings)).toEqual({});
    expect((await problems()).map(each => each.path)).toContain('site.ts');

    files.set('site.ts', "export default defineSite({ name: 'SAFT' });");
    await run(syncContent());
    files.delete('site.ts');

    expect(await run(syncContent())).toMatchObject({ removed: 1 });
    expect(await run(siteSettings)).toEqual({});
  });
});

describe('public reads', () => {
  it('hides drafts, future entries and unknown collections', async () => {
    await run(syncContent());

    const missing = async (
      effect: Effect.Effect<unknown, { _tag: string }, ContentStore | Database>
    ) => {
      const result = await run(Effect.result(effect));

      return Result.isFailure(result) ? result.failure._tag : 'found';
    };

    expect(await run(getPublished('blog', 'hello'))).toMatchObject({
      slug: 'hello'
    });
    expect(await missing(getPublished('blog', 'draft'))).toBe('EntryNotFound');
    expect(await missing(getPublished('blog', 'future'))).toBe('EntryNotFound');
    expect(await missing(getPublished('pages', 'hello'))).toBe(
      'CollectionNotFound'
    );
  });
});
