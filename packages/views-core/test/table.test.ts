import { CollectionField, CollectionSummary } from '@venda/contract';
import { expect, it } from 'vitest';
import { tableColumns } from '../src/table';

const field = (key: string, type: string, label: string | null = null) =>
  new CollectionField({
    key,
    type,
    label,
    help: null,
    required: false,
    options: null,
    min: null,
    max: null
  });

const records = (titleField: string | null) =>
  new CollectionSummary({
    slug: 'authors',
    name: 'Authors',
    description: null,
    kind: 'records',
    view: null,
    editor: null,
    titleField,
    bodyField: 'bio',
    fields: [
      field('role', 'text'),
      field('name', 'text'),
      field('bio', 'richtext'),
      field('email', 'url', 'Email address'),
      field('active', 'boolean'),
      field('joined', 'date')
    ]
  });

it('names the entry by its title field, then three more fields in config order, without the body', () => {
  expect(tableColumns(records('name'))).toEqual({
    entry: 'Name',
    columns: [
      { key: 'role', label: 'Role' },
      { key: 'email', label: 'Email address' },
      { key: 'active', label: 'Active' }
    ]
  });
});

it('names the entry column plainly when the model has no title field', () => {
  expect(tableColumns(records(null))).toMatchObject({
    entry: 'Entry',
    columns: [{ key: 'role' }, { key: 'name' }, { key: 'email' }]
  });
});
