import { expect, it } from 'vitest';
import { withChanges } from '../src/commands/site';

const settings = {
  name: 'Hill Notes',
  url: 'https://hill.test',
  screens: { 'content.index': 'Every note.' }
};

it('changes the name, address and screen words, and removes a blank one', () => {
  expect(
    withChanges(settings, [
      'name=Field Notes',
      'url=',
      'screen.accounts.tokens=',
      'screen.content.index=All of it = everything.'
    ])
  ).toEqual({
    name: 'Field Notes',
    url: null,
    screens: {
      'content.index': 'All of it = everything.',
      'accounts.tokens': ''
    }
  });
});

it('refuses anything else', () => {
  expect(() => withChanges(settings, ['title=X'])).toThrow(/expected name/);
  expect(() => withChanges(settings, ['name'])).toThrow(/expected name/);
});
