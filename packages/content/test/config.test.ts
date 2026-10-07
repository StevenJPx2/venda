import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import { readCollectionConfig } from '../src';

const read = (source: string) =>
  Effect.runSync(
    Effect.result(readCollectionConfig('content/blog/config.ts', source))
  );

const BLOG = `import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Blog',
  description: 'Notes and announcements, newest first.',
  kind: 'posts',
  view: 'acme.timeline',
  previewUrl: \`https://example.com/blog/{slug}?preview={token}\`,
  fields: {
    title: { type: 'text', required: true, max: 120 },
    excerpt: { type: 'textarea', max: 300 },
    tags: { type: 'tags' },
    tone: { type: 'select', options: ['calm', 'loud'] },
    body: { type: 'richtext' },
    'order': { type: 'number', min: -10 }
  }
});
`;

function failure(source: string) {
  const result = read(source);

  if (Result.isSuccess(result))
    throw new Error('expected the config to be rejected');

  return result.failure;
}

describe('readCollectionConfig: accepted configs', () => {
  it('reads a model as data and resolves its title and body fields', () => {
    const result = read(BLOG);

    if (Result.isFailure(result)) throw new Error(result.failure.message);

    expect(result.success).toMatchObject({
      name: 'Blog',
      description: 'Notes and announcements, newest first.',
      kind: 'posts',
      view: 'acme.timeline',
      titleField: 'title',
      bodyField: 'body',
      previewUrl: 'https://example.com/blog/{slug}?preview={token}'
    });
    expect(result.success.fields.order).toEqual({ type: 'number', min: -10 });
  });
});

describe('readCollectionConfig: rejected sources', () => {
  it.each([
    [
      'code instead of data',
      "export default defineCollection({ name: 'Blog', kind: 'records', fields: {}, extra: compute() });",
      /CallExpression is not plain data/,
      1
    ],
    [
      'a variable',
      "const name = 'Blog';\nexport default defineCollection({ name, kind: 'records', fields: {} });",
      /Only imports/,
      1
    ],
    [
      'a spread',
      'export default defineCollection({\n  ...base\n});',
      /Spreads are not allowed/,
      2
    ],
    [
      'template expressions',
      "export default defineCollection({ name: `${x}`, kind: 'records', fields: {} });",
      /Template strings/,
      1
    ],
    [
      'no default export',
      'export const blog = defineCollection({});',
      /Only imports|export default/,
      1
    ],
    [
      'another function',
      "export default makeCollection({ name: 'Blog', kind: 'records', fields: {} });",
      /defineCollection/,
      1
    ],
    [
      'invalid syntax',
      'export default defineCollection({',
      /Not valid JavaScript/,
      1
    ]
  ])('rejects %s with its line', (_name, source, message, line) => {
    const error = failure(source);

    expect(error._tag).toBe('InvalidCollectionConfig');
    expect(error.message).toMatch(message);
    expect(error.line).toBe(line);
    expect(error.path).toBe('content/blog/config.ts');
  });
});

describe('readCollectionConfig: rejected field rules', () => {
  it.each([
    ['an unknown field type', "fields: { title: { type: 'colour' } }", /type/],
    [
      'two richtext fields',
      "fields: { title: { type: 'text' }, a: { type: 'richtext' }, b: { type: 'richtext' } }",
      /Only one richtext/
    ],
    [
      'a reserved key',
      "fields: { title: { type: 'text' }, draft: { type: 'boolean' } }",
      /reserved/
    ],
    [
      'a bad key',
      "fields: { 'Title Case': { type: 'text' } }",
      /lowercase letter/
    ],
    [
      'a title that is not text',
      "titleField: 'count', fields: { count: { type: 'number' } }",
      /titleField/
    ],
    [
      'a description longer than 300 characters',
      `description: '${'x'.repeat(301)}', fields: {}`,
      /300 characters/
    ]
  ])('rejects %s', (_name, body, message) => {
    expect(
      failure(
        `export default defineCollection({ name: 'X', kind: 'records', ${body} });`
      ).message
    ).toMatch(message);
  });

  it('requires posts to have a title and a body', () => {
    expect(
      failure(
        "export default defineCollection({ name: 'X', kind: 'posts', fields: { title: { type: 'text' } } });"
      ).message
    ).toMatch(/needs a text title field and a richtext body/);
  });
});
