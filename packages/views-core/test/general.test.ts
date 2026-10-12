import type { AdminPage } from '@venda/admin';
import { SiteSettings } from '@venda/contract';
import { expect, it } from 'vitest';
import { screenCopy } from '../src/general';

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

it('lists each described screen with its words and their source, then ids nothing has', () => {
  const site = new SiteSettings({
    name: null,
    url: null,
    screens: { people: 'Our writers.', tokens: '', peeple: 'Typo.' }
  });

  expect(
    screenCopy(
      [page('people', 'Who signs in.'), page('tokens', 'Keys.'), page('join')],
      site
    )
  ).toEqual([
    {
      id: 'settings',
      title: 'Settings',
      text: 'How this site is set up: its files, its people and its keys.',
      source: 'Default'
    },
    {
      id: 'people',
      title: 'PEOPLE',
      text: 'Our writers.',
      source: 'From site.ts'
    },
    { id: 'tokens', title: 'TOKENS', text: '', source: 'Hidden by site.ts' },
    {
      id: 'peeple',
      title: 'peeple',
      text: 'Typo.',
      source: 'No screen has this id'
    }
  ]);
});
