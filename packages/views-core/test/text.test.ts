import { expect, it } from 'vitest';
import { entryTitle } from '../src/text';

it('uses the model field and falls back to the filename for missing, blank or non-text titles', () => {
  expect(entryTitle({ slug: 'filename', data: { heading: 'Hello' } }, 'heading')).toBe('Hello');
  expect(entryTitle({ slug: 'filename', data: { heading: ' ' } }, 'heading')).toBe('filename');
  expect(entryTitle({ slug: 'filename', data: { heading: 3 } }, 'heading')).toBe('filename');
  expect(entryTitle({ slug: 'filename', data: {} }, null)).toBe('filename');
});
