import { expect, it } from 'vitest';
import {
  entryActions,
  republishesFile,
  type EntryActionState
} from '../src/entry-actions';

const published: EntryActionState = {
  changed: false,
  editable: true,
  canPublish: true,
  isNew: false,
  state: 'published'
};

it('shows only the actions the person may use on this entry', () => {
  expect(entryActions(published)).toEqual(['unpublish', 'trash']);
  expect(entryActions({ ...published, changed: true })).toEqual([
    'discard',
    'unpublish',
    'trash'
  ]);
  expect(
    entryActions({ ...published, changed: true, canPublish: false })
  ).toEqual(['discard']);
  expect(entryActions({ ...published, changed: true, isNew: true })).toEqual([
    'discard'
  ]);
  expect(
    entryActions({ ...published, editable: false, canPublish: false })
  ).toEqual([]);
  expect(entryActions({ ...published, state: 'draft' })).toEqual(['trash']);
});

it('republishes a clean file draft, and publishes a dirty copy through the writer', () => {
  expect(republishesFile(published)).toBe(false);
  expect(republishesFile({ ...published, state: 'draft' })).toBe(true);
  expect(republishesFile({ ...published, state: 'draft', changed: true })).toBe(
    false
  );
  expect(
    republishesFile({ ...published, state: 'draft', canPublish: false })
  ).toBe(false);
});
