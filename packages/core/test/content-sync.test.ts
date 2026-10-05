import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Effect, Layer, Result } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentStore, ContentStoreError, getPublished, gitBlobSha, IndexDb, listPublished, syncContent } from '../src/content';

const MIGRATION = readFileSync(new URL('../migrations/0004_content_index.sql', import.meta.url), 'utf8');

const encoder = new TextEncoder();

const BLOG = `export default defineCollection({
  name: 'Blog',
  kind: 'posts',
  fields: { title: { type: 'text', required: true }, body: { type: 'richtext' } }
});`;

const post = (title: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\nHello **${title}**.\n`;

let files: Map<string, string>;
let db: DatabaseSync;

const store = Layer.succeed(ContentStore, {
  list: Effect.promise(() => Promise.all([...files].map(async ([path, text]) => ({ path, sha: await gitBlobSha(encoder.encode(text)) })))),
  read: path => {
    const text = files.get(path);

    return text === undefined ? Effect.fail(new ContentStoreError({ message: `No file ${path}` })) : Effect.succeed(text);
  }
});

const index = Layer.sync(IndexDb, () => ({
  all: (sql, params = []) => Effect.sync(() => db.prepare(sql).all(...params)),
  run: (sql, params = []) => Effect.sync(() => void db.prepare(sql).run(...params))
}));

const run = <A, E>(effect: Effect.Effect<A, E, ContentStore | IndexDb>) => Effect.runPromise(Effect.provide(effect, Layer.mergeAll(store, index)));

const problems = () => db.prepare('SELECT path, message, line FROM content_problems ORDER BY path').all();

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  files = new Map([
    ['blog/config.ts', BLOG],
    ['blog/hello.md', post('Hello', 'publishedAt: 2026-01-02T03:04:05+01:00\n')],
    ['blog/older.md', post('Older', 'publishedAt: 2025-01-01T00:00:00Z\n')],
    ['blog/draft.md', '---\ndraft: true\n---\n'],
    ['blog/future.md', post('Future', 'publishedAt: 2999-01-01T00:00:00Z\n')],
    ['blog/broken.md', '---\nexcerpt: no title\n---\n\nBody\n'],
    ['README.md', 'Not content']
  ]);
});

describe('syncContent', () => {
  it('indexes valid files and records the rest as problems', async () => {
    expect(await run(syncContent())).toEqual({ indexed: 6, removed: 0, remaining: 0, problems: 1 });
    expect(problems()).toEqual([{ path: 'blog/broken.md', message: expect.stringMatching(/title is required/), line: null }]);

    const entries = await run(listPublished('blog'));

    expect(entries.map(entry => entry.slug)).toEqual(['hello', 'older']);
    expect(entries[0]).toMatchObject({ id: 'blog/hello', collectionId: 'blog', status: 'published', publishedAt: '2026-01-02T02:04:05.000Z', data: { title: 'Hello', body: { type: 'doc' } } });
  });

  it('does nothing when nothing changed, and re-reads only what did', async () => {
    await run(syncContent());

    expect(await run(syncContent())).toEqual({ indexed: 0, removed: 0, remaining: 0, problems: 0 });

    files.set('blog/hello.md', post('Changed'));
    files.delete('blog/older.md');

    expect(await run(syncContent())).toEqual({ indexed: 1, removed: 1, remaining: 0, problems: 0 });
    expect((await run(listPublished('blog'))).map(entry => entry.data.title)).toEqual(['Changed']);
  });

  it('works through large changes in bounded runs', async () => {
    expect(await run(syncContent(2))).toMatchObject({ indexed: 2, remaining: 4 });
    expect(await run(syncContent(2))).toMatchObject({ indexed: 2, remaining: 2 });
    expect(await run(syncContent(2))).toMatchObject({ indexed: 2, remaining: 0 });
  });

  it('re-reads entries when their config changes, and fixes problems when files are fixed', async () => {
    await run(syncContent());

    files.set('blog/config.ts', BLOG.replace("required: true }", "required: true, max: 3 }"));

    expect(await run(syncContent())).toMatchObject({ indexed: 6, problems: 4 });
    expect((await run(listPublished('blog'))).map(entry => entry.slug)).toEqual([]);

    files.set('blog/config.ts', BLOG);
    files.set('blog/broken.md', post('Fixed'));
    await run(syncContent());

    expect(problems()).toEqual([]);
  });

  it('drops a collection whose config breaks or goes away', async () => {
    await run(syncContent());
    files.set('blog/config.ts', 'export default defineCollection({ name: load() });');
    await run(syncContent());

    expect(problems()).toContainEqual({ path: 'blog/config.ts', message: expect.stringMatching(/not plain data/), line: 1 });
    expect(Result.isFailure(await run(Effect.result(listPublished('blog'))))).toBe(true);

    files.delete('blog/config.ts');

    expect(await run(syncContent())).toMatchObject({ removed: 1 });
    expect(problems().map(each => each.path)).toContain('blog/hello.md');
  });

  it('refuses two files with one slug', async () => {
    files.set('blog/hello.mdx', post('Again'));
    await run(syncContent());

    expect(problems().map(each => each.message)).toContainEqual(expect.stringMatching(/already uses the slug "hello"/));
  });
});

describe('public reads', () => {
  it('hides drafts, future entries and unknown collections', async () => {
    await run(syncContent());

    const missing = async (effect: Effect.Effect<unknown, { _tag: string }, ContentStore | IndexDb>) => {
      const result = await run(Effect.result(effect));

      return Result.isFailure(result) ? result.failure._tag : 'found';
    };

    expect(await run(getPublished('blog', 'hello'))).toMatchObject({ slug: 'hello' });
    expect(await missing(getPublished('blog', 'draft'))).toBe('EntryNotFound');
    expect(await missing(getPublished('blog', 'future'))).toBe('EntryNotFound');
    expect(await missing(getPublished('pages', 'hello'))).toBe('CollectionNotFound');
  });
});
