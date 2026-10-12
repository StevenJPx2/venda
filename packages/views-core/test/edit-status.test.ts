import { expect, it } from 'vitest';
import { WorkingCopy } from '@venda/contract';
import {
  editStateOf,
  editStatus,
  isReadonly,
  type EditState
} from '../src/edit-status';

it('lets an editor change a loaded, idle copy only', () => {
  const idle = { forbidden: false, elsewhere: false, busy: false };

  expect(isReadonly({ publishing: false }, idle)).toBe(false);
  expect(isReadonly(undefined, idle)).toBe(true);
  expect(isReadonly({ publishing: true }, idle)).toBe(true);
  expect(isReadonly({ publishing: false }, { ...idle, busy: true })).toBe(true);
  expect(isReadonly({ publishing: false }, { ...idle, forbidden: true })).toBe(
    true
  );
  expect(isReadonly({ publishing: false }, { ...idle, elsewhere: true })).toBe(
    true
  );
});

const clean: EditState = {
  loaded: true,
  forbidden: false,
  elsewhere: false,
  publishing: false,
  saving: false,
  changedOutside: false,
  dirty: false,
  canPublish: true,
  state: 'published'
};

it('says the one thing that matters most about an entry being edited', () => {
  expect(editStatus(clean)).toBe('Published');
  expect(editStatus({ ...clean, state: 'draft' })).toBe('Draft');
  expect(editStatus({ ...clean, dirty: true })).toBe('Saved · not published');
  expect(editStatus({ ...clean, dirty: true, canPublish: false })).toBe(
    'Saved · waiting for an editor'
  );
  expect(editStatus({ ...clean, dirty: true, saving: true })).toBe('Saving…');
  expect(editStatus({ ...clean, dirty: true, changedOutside: true })).toBe(
    'Changed outside Venda'
  );
  expect(editStatus({ ...clean, publishing: true, saving: true })).toBe(
    'Publishing…'
  );
  expect(editStatus({ ...clean, elsewhere: true })).toBe('Edited elsewhere');
  expect(editStatus({ ...clean, loaded: false })).toBe('');
  expect(editStatus({ ...clean, loaded: false, forbidden: true })).toBe(
    'Published · read-only'
  );
});

it('reads the state from a loaded copy, and from none', () => {
  const flags = { forbidden: false, elsewhere: false, busy: false };
  const copy = new WorkingCopy({
    collection: 'blog',
    slug: 'hello',
    revision: 3,
    baseSha: 'abc',
    data: {},
    publishedAt: null,
    dirty: true,
    publishing: false,
    changedOutside: true,
    currentSha: 'def',
    ownerId: null,
    updatedBy: null,
    updatedAt: null,
    canPublish: true,
    writable: true,
    indexProblem: null
  });

  expect(editStateOf(copy, flags, 'published')).toMatchObject({
    loaded: true,
    dirty: true,
    changedOutside: true,
    canPublish: true
  });
  expect(editStateOf(undefined, { ...flags, busy: true }, undefined)).toEqual({
    loaded: false,
    forbidden: false,
    elsewhere: false,
    saving: true,
    publishing: false,
    changedOutside: false,
    dirty: false,
    canPublish: false,
    state: undefined
  });
});
