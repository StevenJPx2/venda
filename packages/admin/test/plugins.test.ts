import { expect, it } from 'vitest';
import {
  canOpen,
  listed,
  registerPlugins,
  resolvePage,
  type AdminPage
} from '../src/plugin';

const page: AdminPage = {
  id: 'content.list',
  path: 'content/:collection',
  title: 'Content',
  section: 'content',
  access: 'signed-in',
  load: async () => ({ default: {} })
};

it('resolves lazy pages without loading their screens and enforces access', () => {
  const pages = registerPlugins([{ id: 'content', pages: [page] }]);

  expect(resolvePage(pages, '/content/blog')?.params).toEqual({
    collection: 'blog'
  });
  expect(resolvePage(pages, '/content/blog/extra')).toBeUndefined();
  expect(canOpen(page, undefined)).toBe(false);
  expect(canOpen(page, 'author')).toBe(true);
  expect(canOpen({ ...page, access: 'administrator' }, 'editor')).toBe(false);
});

it('lists a section by role, leaving out unlisted and forbidden pages', () => {
  const nav = { label: 'People', icon: 'i-lucide-users' };
  const people: AdminPage = {
    ...page,
    id: 'people',
    path: 'settings/people',
    section: 'settings',
    access: 'administrator',
    nav
  };
  const tokens: AdminPage = {
    ...people,
    id: 'tokens',
    path: 'settings/tokens',
    access: 'signed-in'
  };
  const unlisted: AdminPage = {
    ...page,
    id: 'unlisted',
    path: 'settings/unlisted',
    section: 'settings'
  };
  const pages = [page, people, tokens, unlisted];

  expect(listed(pages, 'settings', 'administrator').map(p => p.id)).toEqual([
    'people',
    'tokens'
  ]);
  expect(listed(pages, 'settings', 'author').map(p => p.id)).toEqual([
    'tokens'
  ]);
  expect(listed(pages, 'settings', undefined)).toEqual([]);
});

it('rejects duplicate plugin ids and equivalent parameterised paths', () => {
  expect(() =>
    registerPlugins([
      {
        id: 'content',
        pages: [page, { ...page, id: 'other', path: 'content/:slug' }]
      }
    ])
  ).toThrow('Duplicate');
  expect(() =>
    registerPlugins([
      { id: 'x', pages: [] },
      { id: 'x', pages: [] }
    ])
  ).toThrow('Duplicate');
});
