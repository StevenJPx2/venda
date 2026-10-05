import { describe, expect, it } from 'vitest';
import { parseSchema } from '@venda/schema';
import { cleanEntryData, entryTitle, hyphenateSlug, nextSlug, richTextPreview, slugify } from '../app/utils/content';

const paragraph = (text?: string) => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) });

describe('hyphenateSlug', () => {
  it('turns spaces into hyphens as you type, keeping the caret', () => {
    expect(hyphenateSlug('my post', 3)).toEqual({ value: 'my-post', caret: 3 });
    expect(hyphenateSlug('my ')).toEqual({ value: 'my-', caret: 3 });
  });

  it('never doubles a hyphen, but keeps ones typed on purpose', () => {
    expect(hyphenateSlug('my- post')).toEqual({ value: 'my-post', caret: 7 });
    expect(hyphenateSlug('my  \tpost')).toEqual({ value: 'my-post', caret: 7 });
    expect(hyphenateSlug('my -post')).toEqual({ value: 'my-post', caret: 7 });
    expect(hyphenateSlug('a--b')).toEqual({ value: 'a--b', caret: 4 });
  });

  it('moves the caret back by the characters removed before it', () => {
    // Pasting "edge  cases" before the caret at the end.
    expect(hyphenateSlug('edge  cases', 11)).toEqual({ value: 'edge-cases', caret: 10 });
    expect(hyphenateSlug('a  b', 2)).toEqual({ value: 'a-b', caret: 2 });
  });

  it('leaves case and other characters for slugify on blur', () => {
    expect(hyphenateSlug('Hello World!')).toEqual({ value: 'Hello-World!', caret: 12 });
  });
});

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
