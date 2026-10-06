import { expect, it } from 'vitest';
import { entryTitle, fieldText, stateLabel } from '../src/text';

it('uses the model field and falls back to the filename for missing, blank or non-text titles', () => {
  expect(entryTitle({ slug: 'filename', data: { heading: 'Hello' } }, 'heading')).toBe('Hello');
  expect(entryTitle({ slug: 'filename', data: { heading: ' ' } }, 'heading')).toBe('filename');
  expect(entryTitle({ slug: 'filename', data: { heading: 3 } }, 'heading')).toBe('filename');
  expect(entryTitle({ slug: 'filename', data: {} }, null)).toBe('filename');
});

it('shows text fields as written and other values as JSON', () => {
  expect(fieldText('Ann Lee')).toBe('Ann Lee');
  expect(fieldText(['news', 'notes'])).toBe('news, notes');
  expect(fieldText([1, 'two'])).toBe('[1,"two"]');
  expect(fieldText(true)).toBe('true');
});

it('names every state as a sentence-case status', () => {
  expect(stateLabel('published')).toBe('Published');
  expect(stateLabel('draft')).toBe('Draft');
  expect(stateLabel('future')).toBe('Future dated');
});
