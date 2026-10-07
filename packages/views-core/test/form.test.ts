import {
  CollectionField,
  CollectionSummary,
  IndexedEntry
} from '@venda/contract';
import { expect, it } from 'vitest';
import { formRows } from '../src/form';

const field = (key: string, type: string, label: string | null = null) =>
  new CollectionField({ key, type, label });

it('gives every field, in config order, a control that fits its type', () => {
  const home = new CollectionSummary({
    slug: 'home',
    name: 'Home',
    description: null,
    kind: 'single',
    view: null,
    editor: null,
    titleField: 'headline',
    bodyField: 'body',
    fields: [
      field('headline', 'text'),
      field('intro', 'textarea', 'Introduction'),
      field('featured', 'boolean'),
      field('topics', 'tags'),
      field('body', 'richtext'),
      field('order', 'number')
    ]
  });
  const entry = new IndexedEntry({
    collection: 'home',
    slug: 'index',
    state: 'published',
    publishedAt: null,
    data: {
      headline: 'Welcome',
      intro: 'Two lines\nof intro.',
      featured: true,
      topics: ['cms', 'files'],
      body: { type: 'doc', content: [] }
    }
  });

  expect(formRows(home, entry)).toEqual([
    {
      key: 'headline',
      label: 'Headline',
      control: { kind: 'text', text: 'Welcome' }
    },
    {
      key: 'intro',
      label: 'Introduction',
      control: { kind: 'textarea', text: 'Two lines\nof intro.' }
    },
    {
      key: 'featured',
      label: 'Featured',
      control: { kind: 'switch', on: true }
    },
    {
      key: 'topics',
      label: 'Topics',
      control: { kind: 'tags', tags: ['cms', 'files'] }
    },
    {
      key: 'body',
      label: 'Body',
      control: { kind: 'richtext', doc: { type: 'doc', content: [] } }
    },
    { key: 'order', label: 'Order', control: { kind: 'text', text: '' } }
  ]);
});
