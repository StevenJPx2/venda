import { CollectionSummary } from '@venda/contract';
import { expect, it } from 'vitest';
import { byKind, collectionHeading } from '../src/collections';

const collection = (
  name: string,
  kind: CollectionSummary['kind']
): CollectionSummary =>
  new CollectionSummary({
    slug: name.toLowerCase(),
    name,
    description: null,
    kind,
    titleField: null,
    bodyField: null
  });

it('heads a collection with its own name and description, inventing none', () => {
  const journal = new CollectionSummary({
    ...collection('Journal', 'posts'),
    description: 'Notes, newest first.'
  });

  expect(collectionHeading(journal)).toMatchObject({
    title: 'Journal',
    description: 'Notes, newest first.'
  });
  expect(collectionHeading(collection('Authors', 'records')).description).toBe(
    undefined
  );
  expect(collectionHeading(undefined)).toMatchObject({
    title: 'Content',
    description: undefined
  });
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
