import { describe, expect, it } from 'vitest';
import type { VendaEntry } from '../src/runtime/types';
import { collectionKey, contentUrl, isNotFound, shapeEntries } from '../src/runtime/utils';

function entry(slug: string, data: Record<string, unknown>): VendaEntry {
  return { id: slug, collectionId: 'c', slug, data, status: 'published', createdAt: '', updatedAt: '' };
}

describe('contentUrl', () => {
  it('joins base and path, tolerating trailing slashes', () => {
    expect(contentUrl('https://api.test/api/', 'blog')).toBe('https://api.test/api/content/blog');
    expect(contentUrl('https://api.test/api', 'blog', 'hello')).toBe('https://api.test/api/content/blog/hello');
  });

  it('encodes path segments', () => {
    expect(contentUrl('https://api.test/api', 'blog', 'a b/c')).toBe('https://api.test/api/content/blog/a%20b%2Fc');
  });
});

describe('shapeEntries', () => {
  const entries = [entry('b', { order: 2 }), entry('none', {}), entry('a', { order: 1 }), entry('c', { order: 10 })];

  it('keeps API order when no sort is given', () => {
    expect(shapeEntries(entries).map(e => e.slug)).toEqual(['b', 'none', 'a', 'c']);
  });

  it('sorts numerically, ascending by default, missing values last', () => {
    expect(shapeEntries(entries, { sortBy: 'order' }).map(e => e.slug)).toEqual(['a', 'b', 'c', 'none']);
  });

  it('sorts descending but still puts missing values last', () => {
    expect(shapeEntries(entries, { sortBy: 'order', order: 'desc' }).map(e => e.slug)).toEqual(['c', 'b', 'a', 'none']);
  });

  it('limits after sorting without mutating the input', () => {
    const before = entries.map(e => e.slug);
    expect(shapeEntries(entries, { sortBy: 'order', limit: 2 }).map(e => e.slug)).toEqual(['a', 'b']);
    expect(entries.map(e => e.slug)).toEqual(before);
  });
});

describe('collectionKey', () => {
  it('differs when options differ so cached results never collide', () => {
    expect(collectionKey('blog')).not.toBe(collectionKey('blog', { limit: 3 }));
    expect(collectionKey('blog', { sortBy: 'order' })).toBe(collectionKey('blog', { sortBy: 'order' }));
  });
});

describe('isNotFound', () => {
  it('recognises ofetch-style 404 errors only', () => {
    expect(isNotFound({ statusCode: 404 })).toBe(true);
    expect(isNotFound({ status: 404 })).toBe(true);
    expect(isNotFound({ statusCode: 500 })).toBe(false);
    expect(isNotFound(new Error('boom'))).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
