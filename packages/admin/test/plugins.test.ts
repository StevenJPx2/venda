import { expect, it } from 'vitest';
import {
  canOpen,
  choose,
  listed,
  registerPlugins,
  resolvePage,
  type AdminPage,
  type AdminView
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
  const { pages } = registerPlugins([{ id: 'content', pages: [page] }]);

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

const view = (id: string, kinds: AdminView['kinds']): AdminView => ({
  id,
  label: id,
  kinds,
  load: async () => ({ default: {} })
});

it('shows a collection with the view its config names, else the last for its kind', () => {
  const { views } = registerPlugins([
    { id: 'preset', views: [view('venda.list', ['posts', 'pages'])] },
    { id: 'site', views: [view('acme.timeline', ['posts'])] }
  ]);

  // A site plugin listed after the preset replaces the default for posts only.
  expect(choose(views, 'posts', null).slot?.id).toBe('acme.timeline');
  expect(choose(views, 'pages', null).slot?.id).toBe('venda.list');

  // A collection may name any installed view, whatever its kind.
  expect(choose(views, 'posts', 'venda.list').slot?.id).toBe('venda.list');

  // A name nothing provides falls back to the default, and says so.
  expect(choose(views, 'posts', 'acme.missing')).toMatchObject({
    slot: { id: 'acme.timeline' },
    missing: 'acme.missing'
  });
  expect(choose(views, 'records', null).slot).toBeUndefined();
});

it('rejects a view or editor id another contribution already uses', () => {
  expect(() =>
    registerPlugins([
      { id: 'a', views: [view('shared', ['posts'])] },
      { id: 'b', editors: [view('shared', ['posts'])] }
    ])
  ).toThrow('Duplicate admin editor: shared');
});
