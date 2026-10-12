import { SiteSettings } from '@venda/contract';
import { expect, it } from 'vitest';
import { screenDescription, windowTitle } from '../src/site';

const saft = new SiteSettings({
  name: 'SAFT',
  url: null,
  screens: { 'content.index': 'Everything SAFT publishes.', tokens: '' }
});

it("describes a screen in the site's words, else its plugin's, and shows none for an empty string", () => {
  expect(screenDescription(saft, 'content.index', 'Default')).toBe(
    'Everything SAFT publishes.'
  );
  expect(screenDescription(saft, 'people', 'Who signs in.')).toBe(
    'Who signs in.'
  );
  expect(screenDescription(saft, 'tokens', 'Keys.')).toBeUndefined();
  expect(screenDescription(null, 'people', undefined)).toBeUndefined();
});

it('names window titles for the site once it has a name', () => {
  expect(windowTitle(saft, 'People')).toBe('People · SAFT');
  expect(windowTitle(null, 'People')).toBe('People · Venda');
});
