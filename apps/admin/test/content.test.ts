import { describe, expect, it } from 'vitest';
import { hyphenateSlug, slugify } from '../app/utils/content';

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
    expect(hyphenateSlug('edge  cases', 11)).toEqual({
      value: 'edge-cases',
      caret: 10
    });
    expect(hyphenateSlug('a  b', 2)).toEqual({ value: 'a-b', caret: 2 });
  });

  it('leaves case and other characters for slugify on blur', () => {
    expect(hyphenateSlug('Hello World!')).toEqual({
      value: 'Hello-World!',
      caret: 12
    });
  });
});

describe('slugify', () => {
  it('names entries the way entry files are named', () => {
    expect(slugify('  Hello, Venda CMS! ')).toBe('hello-venda-cms');
    expect(slugify('')).toBe('');
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
});
