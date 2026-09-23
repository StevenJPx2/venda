import { describe, expect, it } from 'vitest';
import { objectInput, slugify, statusInput } from '../src/validation';

describe('validation', () => {
  it('creates stable URL slugs', () => expect(slugify('  Hello, Venda CMS! ')).toBe('hello-venda-cms'));
  it('rejects non-object entry data', () => expect(() => objectInput([])).toThrow('Expected an object'));
  it('accepts only supported publication states', () => {
    expect(statusInput('published')).toBe('published');
    expect(() => statusInput('live')).toThrow('Status must be draft or published');
  });
});
