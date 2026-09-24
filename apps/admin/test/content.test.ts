import { describe, expect, it } from 'vitest';
import { parseSchema } from '@venda/schema';
import { cleanEntryData, entryTitle, nextSlug, slugify, trimTrailingEmpty, wordCount } from '../app/utils/content';

describe('slugify', () => {
  it('matches the API rules', () => {
    expect(slugify('  Hello, Venda CMS! ')).toBe('hello-venda-cms');
    expect(slugify('')).toBe('');
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
});

describe('wordCount', () => {
  it('counts words across markup', () => {
    expect(wordCount('<h2>Two words</h2><p>and <strong>three</strong> more</p>')).toBe(5);
    expect(wordCount('<p></p>')).toBe(0);
  });
});

describe('trimTrailingEmpty', () => {
  it('drops trailing empty paragraphs only', () => {
    expect(trimTrailingEmpty('<p>Hi</p><p></p><p><br class="x"></p>')).toBe('<p>Hi</p>');
    expect(trimTrailingEmpty('<p></p><p>Hi</p>')).toBe('<p></p><p>Hi</p>');
  });
});

describe('cleanEntryData', () => {
  const schema = parseSchema({
    titleField: 'title',
    fields: [
      { key: 'title', interface: 'input' },
      { key: 'body', interface: 'wysiwyg' },
      { key: 'tags', interface: 'tags' },
      { key: 'featured', interface: 'toggle' },
      { key: 'price', interface: 'number' }
    ]
  });

  it('trims text, strips trailing empty paragraphs and drops empty values', () => {
    const data = { title: '  Hello ', body: '<p>Hi</p><p></p>', tags: [], featured: false, price: 0, legacy: 'kept' };
    expect(cleanEntryData(schema, data)).toEqual({ title: 'Hello', body: '<p>Hi</p>', featured: false, price: 0, legacy: 'kept' });
  });

  it('drops a body that is only an empty paragraph', () => {
    expect(cleanEntryData(schema, { body: '<p></p>' })).toEqual({});
  });

  it('names entries by their title field, falling back to the slug', () => {
    expect(entryTitle(schema, { slug: 's', data: { title: 'Post' } })).toBe('Post');
    expect(entryTitle(schema, { slug: 's', data: { title: '  ' } })).toBe('s');
  });
});

describe('nextSlug', () => {
  it('appends or increments a numeric suffix', () => {
    expect(nextSlug('post')).toBe('post-2');
    expect(nextSlug('post-2')).toBe('post-3');
    expect(nextSlug('top-10-tips-9')).toBe('top-10-tips-10');
  });
});
