import { expect, it } from 'vitest';
import { textSha } from '../src';

it('gives a file the SHA git gives it', async () => {
  // `printf 'hello\n' | git hash-object --stdin`
  expect(await textSha('hello\n')).toBe(
    'ce013625030ba8dba906f756967f9e9ca394464a'
  );
});
