import { expect, it } from 'vitest';
import { batchesOf } from '../src/commands/transfer';

it('splits an import into requests of at most 200 files and 20 MB', () => {
  const small = Array.from({ length: 450 }, (_, index) => ({
    path: `blog/post-${index}.md`,
    text: 'Hi\n'
  }));
  const large = Array.from({ length: 30 }, (_, index) => ({
    path: `blog/large-${index}.md`,
    text: 'x'.repeat(1_000_000)
  }));

  expect(batchesOf(small).map(batch => batch.length)).toEqual([200, 200, 50]);
  expect(batchesOf(large).map(batch => batch.length)).toEqual([20, 10]);
  expect(batchesOf([])).toEqual([]);
});
