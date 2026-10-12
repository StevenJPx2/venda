import { CollectionSummary, type CollectionField } from '@venda/contract';
import { expect, it } from 'vitest';
import { coverAddress, coverFieldOf } from '../src/cover';

const field = (key: string, type: string): CollectionField => ({
  key,
  type,
  label: key,
  help: null,
  required: false,
  options: null,
  min: null,
  max: null
});

const journal = (fields: CollectionField[]) =>
  new CollectionSummary({
    slug: 'journal',
    name: 'Journal',
    description: null,
    kind: 'posts',
    view: null,
    editor: null,
    titleField: 'title',
    bodyField: 'body',
    fields
  });

it('shows the first image field as the feature image', () => {
  expect(
    coverFieldOf(
      journal([
        field('title', 'text'),
        field('cover', 'image'),
        field('thumb', 'image')
      ])
    )
  ).toBe('cover');
});

it('has no feature image without an image field', () => {
  expect(coverFieldOf(journal([field('title', 'text')]))).toBeNull();
});

it('saves a typed address trimmed, and nothing for blank', () => {
  expect(coverAddress('  https://example.com/a.jpg ')).toBe(
    'https://example.com/a.jpg'
  );
  expect(coverAddress('   ')).toBeNull();
});
