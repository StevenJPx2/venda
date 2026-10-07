import { CollectionSummary } from '@venda/contract';
import { expect, it } from 'vitest';
import { byKind } from '../src/collections';

const collection = (
  name: string,
  kind: CollectionSummary['kind']
): CollectionSummary =>
  new CollectionSummary({
    slug: name.toLowerCase(),
    name,
    kind,
    titleField: null,
    bodyField: null
  });

it('lists writing first, then singles, then records, A to Z within each', () => {
  const sorted = byKind([
    collection('Authors', 'records'),
    collection('home', 'single'),
    collection('Pages', 'pages'),
    collection('journal', 'posts'),
    collection('Blog', 'posts'),
    collection('Settings', 'single')
  ]);

  expect(sorted.map(each => each.name)).toEqual([
    'Blog',
    'journal',
    'Pages',
    'home',
    'Settings',
    'Authors'
  ]);
});
