import { Effect, Option, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { entryPath, readCollectionConfig, readEntry, writeEntry, type CollectionModel } from '../src';

const model: CollectionModel = Effect.runSync(readCollectionConfig('blog/config.ts', `export default defineCollection({
  name: 'Blog',
  kind: 'posts',
  fields: {
    title: { type: 'text', required: true, max: 40 },
    excerpt: { type: 'textarea' },
    tags: { type: 'tags' },
    rating: { type: 'number', min: 1, max: 5 },
    tone: { type: 'select', options: ['calm', 'loud'] },
    body: { type: 'richtext', required: true }
  }
});`));

const read = (source: string, path = 'blog/hello-world.md') => Effect.runSync(Effect.result(readEntry(model, path, source)));

const POST = `---
title: Hello world
tags: [one, two]
rating: 4
publishedAt: 2026-10-05T09:30:00Z
author: Ann
---

Hello **there**.
`;

function failure(source: string, path?: string) {
  const result = read(source, path);

  if (Result.isSuccess(result)) throw new Error('expected the entry to be rejected');

  return result.failure;
}

describe('readEntry', () => {
  it('reads fields, Venda keys, unknown keys and the body', () => {
    const result = read(POST);

    if (Result.isFailure(result)) throw new Error(result.failure.message);

    expect(result.success).toMatchObject({ collection: 'blog', slug: 'hello-world', draft: false, publishedAt: '2026-10-05T09:30:00Z', extra: { author: 'Ann' } });
    expect(result.success.data).toMatchObject({ title: 'Hello world', tags: ['one', 'two'], rating: 4 });
    expect(result.success.data.body).toMatchObject({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('writes the file back unchanged', () => {
    const result = read(POST);

    if (Result.isFailure(result)) throw new Error(result.failure.message);

    expect(writeEntry(model, result.success)).toBe(POST);
  });

  it('lets drafts skip required fields', () => {
    expect(Result.isSuccess(read('---\ndraft: true\n---\n'))).toBe(true);
    expect(failure('---\ntitle: Hi\n---\n').message).toMatch(/body is required to publish/);
  });

  it.each([
    ['a value of the wrong type', '---\ntitle: Hi\nrating: lots\n---\n\nBody\n', /rating/, 3],
    ['a number out of range', '---\ntitle: Hi\nrating: 9\n---\n\nBody\n', /rating/, 3],
    ['a select outside its options', '---\ntitle: Hi\ntone: shouty\n---\n\nBody\n', /tone/, 3],
    ['a title over its limit', `---\ntitle: ${'x'.repeat(41)}\n---\n\nBody\n`, /title/, 2],
    ['a bad publishedAt', '---\ntitle: Hi\npublishedAt: yesterday\n---\n\nBody\n', /publishedAt/, 3],
    ['broken YAML', '---\ntitle: [unclosed\n---\n\nBody\n', /not valid YAML/, undefined],
    ['a missing title', '---\nexcerpt: x\n---\n\nBody\n', /title is required/, undefined],
    ['a block tag that is code', '---\ntitle: Hi\n---\n\nIntro\n\n<Chart data={load()} />\n', /not plain data/, 7]
  ])('rejects %s with its line', (_name, source, message, line) => {
    const error = failure(source);

    expect(error.message).toMatch(message);

    if (line !== undefined) expect(error.line).toBe(line);
  });

  it('names slugs after the file', () => {
    expect(failure(POST, 'blog/Hello World.md').message).toMatch(/lowercase, hyphenated slug/);
    expect(Option.getOrUndefined(entryPath('blog/hello.mdx'))).toEqual({ collection: 'blog', slug: 'hello' });
    expect(Option.isNone(entryPath('blog/config.ts'))).toBe(true);
  });
});
