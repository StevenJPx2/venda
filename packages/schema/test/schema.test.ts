import { describe, expect, it } from 'vitest';
import { SchemaError, bodyField, fieldLabel, parseSchema, titleField, validateEntryData, type CollectionSchema } from '../src';

describe('parseSchema', () => {
  it('treats a missing schema as no fields', () => {
    expect(parseSchema(undefined)).toEqual({ version: 1, fields: [] });
  });

  it('upgrades the legacy { key: type } map and picks a title field', () => {
    const schema = parseSchema({ title: 'string', excerpt: 'string', body: 'markdown', tags: 'string[]', price: 'number', inStock: 'boolean' });
    expect(schema.titleField).toBe('title');
    expect(schema.fields.map(f => [f.key, f.interface])).toEqual([
      ['title', 'input'], ['excerpt', 'input'], ['body', 'wysiwyg'], ['tags', 'tags'], ['price', 'number'], ['inStock', 'toggle']
    ]);
  });

  it('uses `name` as the title of legacy schemas without `title`', () => {
    expect(parseSchema({ name: 'string', bio: 'string' }).titleField).toBe('name');
  });

  it('parses full definitions and normalises choices', () => {
    const schema = parseSchema({
      titleField: 'name',
      fields: [
        { key: 'name', interface: 'input', required: true, width: 'half' },
        { key: 'size', interface: 'dropdown', choices: ['s', { value: 'm', label: 'Medium' }] }
      ]
    });
    expect(schema.fields[0]).toEqual({ key: 'name', interface: 'input', required: true, width: 'half' });
    expect(schema.fields[1]?.choices).toEqual([{ value: 's', label: 's' }, { value: 'm', label: 'Medium' }]);
  });

  it.each([
    [{ fields: [{ key: 'Bad Key', interface: 'input' }] }, /Invalid field key/],
    [{ fields: [{ key: 'a', interface: 'slider' }] }, /unknown interface/],
    [{ fields: [{ key: 'a', interface: 'input' }, { key: 'a', interface: 'input' }] }, /more than once/],
    [{ fields: [{ key: 'a', interface: 'dropdown', choices: [] }] }, /at least one choice/],
    [{ fields: [{ key: 'a', interface: 'dropdown', choices: ['x', 'x'] }] }, /unique/],
    [{ titleField: 'body', fields: [{ key: 'body', interface: 'wysiwyg' }] }, /title field/],
    [[], /must be an object/]
  ])('rejects invalid schema %#', (raw, message) => {
    expect(() => parseSchema(raw)).toThrow(SchemaError);
    expect(() => parseSchema(raw)).toThrow(message);
  });
});

describe('field helpers', () => {
  const schema = parseSchema({ titleField: 'title', fields: [{ key: 'title', interface: 'input' }, { key: 'intro', interface: 'textarea' }, { key: 'body', interface: 'wysiwyg' }] });

  it('derives Directus-style labels', () => {
    expect(fieldLabel({ key: 'publishedAt', interface: 'datetime' })).toBe('Published At');
    expect(fieldLabel({ key: 'feature_image', interface: 'image' })).toBe('Feature image');
    expect(fieldLabel({ key: 'x', interface: 'input', label: 'Custom' })).toBe('Custom');
  });

  it('finds the title and the rich-text body', () => {
    expect(titleField(schema)?.key).toBe('title');
    expect(bodyField(schema)?.key).toBe('body');
  });
});

describe('validateEntryData', () => {
  const schema: CollectionSchema = parseSchema({
    fields: [
      { key: 'title', interface: 'input', required: true },
      { key: 'body', interface: 'wysiwyg', required: true },
      { key: 'price', interface: 'number' },
      { key: 'inStock', interface: 'toggle' },
      { key: 'publishedAt', interface: 'datetime' },
      { key: 'size', interface: 'dropdown', choices: ['s', 'm'] },
      { key: 'tags', interface: 'tags' },
      { key: 'cover', interface: 'image' },
      { key: 'meta', interface: 'code' }
    ]
  });

  it('lets drafts skip required fields but not publishing', () => {
    expect(validateEntryData(schema, { body: '<p></p>' }, { published: false })).toEqual([]);
    expect(validateEntryData(schema, { body: '<p></p>' }, { published: true }).map(e => e.field)).toEqual(['title', 'body']);
  });

  it('counts an image-only body as filled in', () => {
    const errors = validateEntryData(schema, { title: 'x', body: '<img src="https://a/b.png">' }, { published: true });
    expect(errors).toEqual([]);
  });

  it('accepts well-typed values and keeps unknown keys alone', () => {
    const data = { title: 'A', body: '<p>B</p>', price: 9.5, inStock: false, publishedAt: '2026-09-24T10:00:00.000Z', size: 'm', tags: ['x'], cover: 'https://cdn/x.png', meta: { a: [1] }, legacy: 42 };
    expect(validateEntryData(schema, data, { published: true })).toEqual([]);
  });

  it.each([
    ['price', 'nine', 'must be a number'],
    ['price', Number.NaN, 'must be a number'],
    ['inStock', 'yes', 'must be true or false'],
    ['publishedAt', 'not a date', 'must be a valid date'],
    ['size', 'xl', 'must be one of the listed choices'],
    ['tags', ['ok', 3], 'must be a list of text tags'],
    ['cover', 'javascript:alert(1)', 'must be an http(s) image URL'],
    ['cover', 'not a url', 'must be an http(s) image URL'],
    ['title', 7, 'must be text']
  ])('rejects %s = %j', (field, value, message) => {
    const errors = validateEntryData(schema, { [field]: value }, { published: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe(field);
    expect(errors[0]?.message).toContain(message);
  });
});
