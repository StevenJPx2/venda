import { expect, it } from 'vitest';
import { canOpen, registerPlugins, resolvePage, type AdminPage } from '../src/plugin';

const page: AdminPage = { id: 'content.list', path: 'content/:collection', title: 'Content', section: 'content', access: 'signed-in', load: async () => ({ default: {} }) };

it('resolves lazy pages without loading their screens and enforces access', () => {
  const pages = registerPlugins([{ id: 'content', pages: [page] }]);

  expect(resolvePage(pages, '/content/blog')?.params).toEqual({ collection: 'blog' });
  expect(resolvePage(pages, '/content/blog/extra')).toBeUndefined();
  expect(canOpen(page, undefined)).toBe(false);
  expect(canOpen(page, 'author')).toBe(true);
  expect(canOpen({ ...page, access: 'administrator' }, 'editor')).toBe(false);
});

it('rejects duplicate plugin ids and equivalent parameterised paths', () => {
  expect(() => registerPlugins([{ id: 'content', pages: [page, { ...page, id: 'other', path: 'content/:slug' }] }])).toThrow('Duplicate');
  expect(() => registerPlugins([{ id: 'x', pages: [] }, { id: 'x', pages: [] }])).toThrow('Duplicate');
});
