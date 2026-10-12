import { Effect, Result } from 'effect';
import { expect, it } from 'vitest';
import { InvalidConfig, readSiteConfig } from '../src';

const read = (source: string) =>
  Effect.runSync(Effect.result(readSiteConfig('site.ts', source)));

it('reads the site name, address and screen copy as data', () => {
  const result = read(`import { defineSite } from 'venda';

export default defineSite({
  name: 'SAFT',
  url: 'https://saftapologetics.com',
  screens: {
    'content.index': 'Everything SAFT publishes.',
    'accounts.tokens': ''
  }
});
`);

  expect(Result.getOrThrow(result)).toEqual({
    name: 'SAFT',
    url: 'https://saftapologetics.com',
    screens: {
      'content.index': 'Everything SAFT publishes.',
      'accounts.tokens': ''
    }
  });
});

it('takes an empty definition: every setting is optional', () => {
  expect(Result.getOrThrow(read('export default defineSite({});'))).toEqual({});
});

it.each([
  [
    'another define call',
    "export default defineCollection({ name: 'X' });",
    /defineSite/
  ],
  [
    'an address without a scheme',
    "export default defineSite({ url: 'saft.org' });",
    /http or https/
  ],
  [
    'a long name',
    `export default defineSite({ name: '${'x'.repeat(61)}' });`,
    /60 characters/
  ],
  [
    'a long description',
    `export default defineSite({ screens: { content: '${'x'.repeat(301)}' } });`,
    /300 characters/
  ]
])('rejects %s with the file and line', (_name, source, message) => {
  const result = read(source);

  if (Result.isSuccess(result)) throw new Error('expected a rejection');

  expect(result.failure).toBeInstanceOf(InvalidConfig);
  expect(result.failure).toMatchObject({ path: 'site.ts', line: 1 });
  expect(result.failure.message).toMatch(message);
});
