import { Effect, Result } from 'effect';
import { expect, it } from 'vitest';
import { printSiteConfig, readSiteConfig } from '../src';

const read = (source: string) =>
  Result.getOrThrow(
    Effect.runSync(Effect.result(readSiteConfig('site.ts', source)))
  );

it('prints site.ts canonically, and reads back the same settings', () => {
  const settings = {
    name: "Ann's notes",
    url: 'https://example.com',
    screens: { 'content.index': 'Line one\nline two \\ done', settings: '' }
  };
  const printed = printSiteConfig(settings);

  expect(printed).toBe(`import { defineSite } from 'venda';

export default defineSite({
  name: 'Ann\\'s notes',
  url: 'https://example.com',
  screens: {
    'content.index': 'Line one\\nline two \\\\ done',
    settings: ''
  }
});
`);
  expect(read(printed)).toEqual(settings);
});

it('leaves unset settings out, and prints an empty site', () => {
  expect(printSiteConfig({ screens: {} })).toContain('defineSite({})');
  expect(read(printSiteConfig({}))).toEqual({});
});

it('keeps control characters as escaped data in the JavaScript literal', () => {
  const settings = {
    name: 'A\rB\tC',
    screens: { settings: 'Null\0, form feed\f and quote "' }
  };

  expect(read(printSiteConfig(settings))).toEqual(settings);
});
