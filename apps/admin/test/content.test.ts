import { describe, expect, it } from 'vitest';
import { parseSchema } from '@venda/schema';
import { cleanEntryData, entryTitle, nextSlug, richTextPreview, slugify } from '../app/utils/content';

const paragraph = (text?: string) => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) });

describe('slugify', () => {
  it('matches the API rules', () => {
    expect(slugify('  Hello, Venda CMS! ')).toBe('hello-venda-cms');
    expect(slugify('')).toBe('');
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
});

describe('richTextPreview', () => {
  it('flattens documents and legacy HTML to one line', () => {
    expect(richTextPreview({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Two words' }] }, paragraph('and more')] })).toBe('Two words and more');
    expect(richTextPreview('<p>Old <strong>html</strong></p>')).toBe('Old html');
    expect(richTextPreview(undefined)).toBe('');
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
    const data = { title: '  Hello ', body: { type: 'doc', content: [paragraph('Hi'), paragraph(), paragraph()] }, tags: [], featured: false, price: 0, legacy: 'kept' };
    expect(cleanEntryData(schema, data)).toEqual({ title: 'Hello', body: { type: 'doc', content: [paragraph('Hi')] }, featured: false, price: 0, legacy: 'kept' });
  });

  it('drops a body that is only an empty paragraph', () => {
    expect(cleanEntryData(schema, { body: { type: 'doc', content: [paragraph()] } })).toEqual({});
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
