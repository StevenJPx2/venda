import { expect, it } from 'vitest';
import { fieldValues } from '../src/commands/entry';

it('reads text, JSON and Markdown field values', () => {
  const values = fieldValues(
    {
      set: ['title=First = light'],
      json: ['rating=4', 'tags=["a","b"]'],
      markdown: ['body=body.md']
    },
    new Map([['body', 'Hello **world**.\n']])
  );

  expect(values).toMatchObject({
    title: 'First = light',
    rating: 4,
    tags: ['a', 'b'],
    body: { type: 'doc' }
  });
});

it('refuses a value without a field, and JSON that is not', () => {
  const none = { set: [], json: [], markdown: [] };

  expect(() => fieldValues({ ...none, set: ['=x'] }, new Map())).toThrow(
    /expected field=value/
  );
  expect(() => fieldValues({ ...none, json: ['n={'] }, new Map())).toThrow(
    /is not JSON/
  );
});
