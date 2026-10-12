import type { AdminPage } from '@venda/admin';
import { SiteSettings } from '@venda/contract';
import { expect, it } from 'vitest';
import { screenDrafts, screensFrom, siteRequest } from '../src/general';

const page = (id: string, description?: string): AdminPage => {
  const base: AdminPage = {
    id,
    path: id,
    title: id.toUpperCase(),
    section: 'settings',
    access: 'administrator',
    load: async () => ({ default: {} })
  };

  return description === undefined ? base : { ...base, description };
};

const site = new SiteSettings({
  name: null,
  url: null,
  screens: { people: 'Our writers.', tokens: '', peeple: 'Typo.' }
});

const pages = [
  page('people', 'Who signs in.'),
  page('tokens', 'Keys.'),
  page('join')
];

it('drafts each described screen as default, own words or hidden, then ids nothing has', () => {
  expect(
    screenDrafts(pages, site).map(({ id, mode, text, stray }) => ({
      id,
      mode,
      text,
      stray
    }))
  ).toEqual([
    { id: 'settings', mode: 'default', text: '', stray: false },
    { id: 'people', mode: 'own', text: 'Our writers.', stray: false },
    { id: 'tokens', mode: 'hidden', text: '', stray: false },
    { id: 'peeple', mode: 'own', text: 'Typo.', stray: true }
  ]);
  expect(screenDrafts(pages, site)[1]?.fallback).toBe('Who signs in.');
});

it('records own words and hidden screens, and leaves defaults and blank words out', () => {
  const drafts = screenDrafts(pages, site).map(draft =>
    draft.id === 'settings'
      ? { ...draft, mode: 'own' as const, text: '  ' }
      : draft
  );

  expect(screensFrom(drafts)).toEqual({
    people: 'Our writers.',
    tokens: '',
    peeple: 'Typo.'
  });
  expect(siteRequest('abc', 'Hill Notes', '', drafts).payload).toMatchObject({
    baseSha: 'abc',
    name: 'Hill Notes',
    screens: { tokens: '' }
  });
});
