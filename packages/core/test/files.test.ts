// Writing content files: every write is one batch that lands entirely or not
// at all, and the index follows the files in that same batch.
import { name } from '@gdp-ts/core';
import { asc } from 'drizzle-orm';
import { Effect, Result } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canEditFiles, isAdministrator } from '../src/auth';
import {
  contentSchema,
  getPublished,
  importFiles,
  listPublished,
  pushFiles,
  siteSettings,
  textSha,
  type FileChange
} from '../src/content';
import { Database } from '../src/database';
import { admin, author, BLOG, post, writeHarness } from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

const push = (changes: ReadonlyArray<FileChange>, as = admin) =>
  h.run(
    Effect.result(
      name(as, user =>
        Effect.flatMap(canEditFiles(user), proof =>
          pushFiles(user, 'A change', changes, proof)
        )
      )
    )
  );

const importAll = (files: ReadonlyArray<{ path: string; text: string }>) =>
  h.run(
    name(admin, user =>
      Effect.flatMap(isAdministrator(user), proof =>
        importFiles(user, files, proof)
      )
    )
  );

const sha = async (path: string) => textSha((await h.file(path)) ?? '');

const problems = () =>
  h.run(
    Effect.flatMap(Database, db =>
      db
        .select({
          path: contentSchema.contentProblems.path,
          message: contentSchema.contentProblems.message
        })
        .from(contentSchema.contentProblems)
        .orderBy(asc(contentSchema.contentProblems.path))
    )
  );

const titles = async () =>
  (await h.run(listPublished('blog'))).map(entry => entry.data.title).sort();

describe('a write', () => {
  it('changes several files at once, each from the SHA it was read at', async () => {
    const written = await push([
      {
        path: 'blog/hello.md',
        text: post('Hello again'),
        baseSha: await sha('blog/hello.md')
      },
      { path: 'blog/third.md', text: post('Third'), baseSha: null }
    ]);

    expect(Result.isSuccess(written)).toBe(true);
    expect(await titles()).toEqual(['Hello again', 'Second', 'Third']);
    expect((await h.revisions()).map(each => each.path)).toEqual([
      'blog/hello.md',
      'blog/third.md'
    ]);
  });

  it('writes nothing when any one file moved since it was read', async () => {
    const stale = await sha('blog/second.md');

    await h.outside('blog/second.md', post('Moved'));

    const written = await push([
      { path: 'blog/third.md', text: post('Third'), baseSha: null },
      { path: 'blog/second.md', text: post('Mine'), baseSha: stale }
    ]);

    expect(Result.isFailure(written) && written.failure._tag).toBe('Conflict');
    expect(await h.file('blog/third.md')).toBeUndefined();
    expect(await titles()).toEqual(['Hello', 'Moved']);
  });

  it('refuses a file the index cannot read, and a path that is not content', async () => {
    const unreadable = await push([
      { path: 'blog/broken.md', text: '---\nexcerpt: x\n---\n', baseSha: null }
    ]);
    const elsewhere = await push([
      { path: 'README.md', text: 'Hi', baseSha: null }
    ]);

    expect(Result.isFailure(unreadable) && unreadable.failure._tag).toBe(
      'InvalidContent'
    );
    expect(Result.isFailure(elsewhere) && elsewhere.failure._tag).toBe(
      'InvalidContent'
    );
    expect(await h.file('blog/broken.md')).toBeUndefined();
  });

  it('is for administrators and editors only', async () => {
    const refused = await push(
      [{ path: 'blog/third.md', text: post('Third'), baseSha: null }],
      author
    );

    expect(Result.isFailure(refused) && refused.failure._tag).toBe('Forbidden');
  });

  it('records a deletion as a revision, and takes the entry out of the index', async () => {
    await push([
      {
        path: 'blog/second.md',
        text: null,
        baseSha: await sha('blog/second.md')
      }
    ]);

    expect(await titles()).toEqual(['Hello']);
    expect(await h.revisions()).toEqual([
      { path: 'blog/second.md', message: 'A change', author: 'admin' }
    ]);
  });
});

describe('the index follows the files', () => {
  it('reads every entry again when the model changes, in the same write', async () => {
    await push([
      {
        path: 'blog/config.ts',
        text: BLOG.replace('max: 40', 'max: 5'),
        baseSha: await sha('blog/config.ts')
      }
    ]);

    expect(await titles()).toEqual(['Hello']);
    expect((await problems()).map(problem => problem.path)).toEqual([
      'blog/second.md'
    ]);

    await push([
      {
        path: 'blog/config.ts',
        text: BLOG,
        baseSha: await sha('blog/config.ts')
      }
    ]);

    expect(await titles()).toEqual(['Hello', 'Second']);
    expect(await problems()).toEqual([]);
  });

  it('reads entries changed with their model against the new model', async () => {
    const written = await push([
      {
        path: 'blog/config.ts',
        text: BLOG.replace(
          'required: true, max: 40 }',
          "required: true, max: 40 }, mood: { type: 'text', required: true }"
        ),
        baseSha: await sha('blog/config.ts')
      },
      {
        path: 'blog/hello.md',
        text: '---\ntitle: Hello\nmood: calm\n---\n\nHi.\n',
        baseSha: await sha('blog/hello.md')
      }
    ]);

    expect(Result.isSuccess(written)).toBe(true);
    expect((await h.run(getPublished('blog', 'hello'))).data.mood).toBe('calm');
    expect((await problems()).map(problem => problem.path)).toEqual([
      'blog/second.md'
    ]);
  });
});

describe('the index after a removal or a clash', () => {
  it('leaves entries without a model as problems when their config goes', async () => {
    await push([
      {
        path: 'blog/config.ts',
        text: null,
        baseSha: await sha('blog/config.ts')
      }
    ]);

    expect((await problems()).map(problem => problem.path)).toEqual([
      'blog/hello.md',
      'blog/second.md'
    ]);
  });

  it('gives a slug to one file only', async () => {
    await importAll([{ path: 'blog/hello.mdx', text: post('Twin') }]);

    expect(await problems()).toEqual([
      {
        path: 'blog/hello.mdx',
        message: 'blog/hello.md already uses the slug "hello"'
      }
    ]);
  });

  it('takes the site settings from site.ts, and none from a broken one', async () => {
    await importAll([
      {
        path: 'site.ts',
        text: "export default defineSite({ name: 'Hill Notes' });"
      }
    ]);
    expect(await h.run(siteSettings)).toMatchObject({ name: 'Hill Notes' });

    await importAll([{ path: 'site.ts', text: 'not a config' }]);
    expect(await h.run(siteSettings)).toEqual({});
    expect((await problems()).map(problem => problem.path)).toEqual([
      'site.ts'
    ]);
  });
});

describe('import', () => {
  it('takes a full batch of 200 files at once', async () => {
    const files = Array.from({ length: 200 }, (_, index) => ({
      path: `blog/many-${index}.md`,
      text: post(`Many ${index}`)
    }));

    expect(await importAll(files)).toEqual({ imported: 200, unchanged: 0 });
    expect(await importAll(files)).toEqual({ imported: 0, unchanged: 200 });
    expect(await titles()).toHaveLength(202);
  });

  it('keeps unreadable files as problems, and adds nothing when run again', async () => {
    const files = [
      { path: 'blog/broken.md', text: '---\nexcerpt: x\n---\n' },
      { path: 'blog/third.md', text: post('Third') }
    ];

    expect(await importAll(files)).toEqual({ imported: 2, unchanged: 0 });
    expect(await h.file('blog/broken.md')).toBeDefined();
    expect((await problems()).map(problem => problem.path)).toEqual([
      'blog/broken.md'
    ]);
    expect(await importAll(files)).toEqual({ imported: 0, unchanged: 2 });
    expect(await h.revisions()).toHaveLength(2);
  });
});
