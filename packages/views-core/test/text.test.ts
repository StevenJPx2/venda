import { expect, it } from 'vitest';
import {
  cellText,
  dateText,
  dayText,
  entryTitle,
  fieldText,
  stateLabel
} from '../src/text';

it('uses the model field and falls back to the filename for missing, blank or non-text titles', () => {
  expect(
    entryTitle({ slug: 'filename', data: { heading: 'Hello' } }, 'heading')
  ).toBe('Hello');
  expect(
    entryTitle({ slug: 'filename', data: { heading: ' ' } }, 'heading')
  ).toBe('filename');
  expect(
    entryTitle({ slug: 'filename', data: { heading: 3 } }, 'heading')
  ).toBe('filename');
  expect(entryTitle({ slug: 'filename', data: {} }, null)).toBe('filename');
});

it('shows text fields as written and other values as JSON', () => {
  expect(fieldText('Ann Lee')).toBe('Ann Lee');
  expect(fieldText(['news', 'notes'])).toBe('news, notes');
  expect(fieldText([1, 'two'])).toBe('[1,"two"]');
  expect(fieldText(true)).toBe('true');
});

it("reads a publish date in the reader's locale, and says so when there is none", () => {
  expect(dateText(null)).toBe('No date set');
  expect(dateText('2026-09-28T07:30:00.000Z', 'en-GB')).toMatch(
    /^28 Sept? 2026, \d{2}:\d{2}$/
  );
});

it('leaves a missing cell blank and shows a switch as yes or no', () => {
  expect(cellText(undefined)).toBe('');
  expect(cellText(null)).toBe('');
  expect(cellText(true)).toBe('Yes');
  expect(cellText(false)).toBe('No');
  expect(cellText(['a', 'b'])).toBe('a, b');
});

it('gives list rows a short day, and nothing when undated', () => {
  expect(dayText('2026-09-01T06:00:00.000Z', 'en-GB')).toMatch(
    /^1 Sept? 2026$/
  );
  expect(dayText(null)).toBe('');
});

it('names every state as a sentence-case status', () => {
  expect(stateLabel('published')).toBe('Published');
  expect(stateLabel('draft')).toBe('Draft');
  expect(stateLabel('future')).toBe('Future dated');
});
