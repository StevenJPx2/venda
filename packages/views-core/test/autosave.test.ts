import { AdminRequestError } from '@venda/admin';
import { WorkingCopy } from '@venda/contract';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  autosave,
  copyState,
  SAVE_PAUSE_MS,
  type SavePayload
} from '../src/autosave';

const copyAt = (revision: number) =>
  new WorkingCopy({
    collection: 'blog',
    slug: 'hello',
    revision,
    baseSha: 'abc',
    data: {},
    publishedAt: null,
    dirty: true,
    changedOutside: false,
    currentSha: 'abc',
    ownerId: null,
    updatedBy: null,
    updatedAt: null,
    canPublish: true,
    indexProblem: null
  });

beforeEach(() => vi.useFakeTimers());

afterEach(() => vi.useRealTimers());

function edited(revision = 1) {
  const state = copyState();

  state.copy.value = copyAt(revision);
  state.pending.value = true;
  state.data.value = { title: 'Typed' };

  return state;
}

it('saves once after a pause, from the revision the copy is at', async () => {
  const state = edited(4);
  const sent: SavePayload[] = [];
  const saver = autosave(state, async payload => {
    sent.push(payload);

    return copyAt(payload.revision + 1);
  });

  saver.schedule();
  saver.schedule();
  await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);

  expect(sent).toEqual([
    { revision: 4, data: { title: 'Typed' }, publishedAt: null }
  ]);
  expect(state.copy.value?.revision).toBe(5);
  expect(state.pending.value).toBe(false);
});

it('saves an edit made while a save was in flight, from the newer revision', async () => {
  const state = edited(1);
  const revisions: number[] = [];
  let release = () => {};
  const saver = autosave(state, payload => {
    revisions.push(payload.revision);

    return revisions.length === 1
      ? new Promise(done => {
          release = () => done(copyAt(2));
        })
      : Promise.resolve(copyAt(3));
  });

  saver.schedule();
  await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
  state.pending.value = true;
  release();
  await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);

  expect(revisions).toEqual([1, 2]);
  expect(state.copy.value?.revision).toBe(3);
});

it('stops after someone else saved, and keeps other failures to show', async () => {
  const state = edited();
  const saver = autosave(state, () =>
    Promise.reject(new AdminRequestError('EditedElsewhere', 'Someone else'))
  );

  await expect(saver.flush()).rejects.toThrow('Your latest edits');

  expect(state.elsewhere.value).toBe(true);
  expect(state.pending.value).toBe(true);
  expect(state.error.value).toBe('');

  const offline = edited();

  await expect(
    autosave(offline, () =>
      Promise.reject(
        new AdminRequestError('Unavailable', 'Check your connection')
      )
    ).flush()
  ).rejects.toThrow('Check your connection');

  expect(offline.error.value).toBe('Check your connection');
  expect(offline.elsewhere.value).toBe(false);
});

it('saves nothing without a change or a loaded copy', async () => {
  const request = vi.fn(async () => copyAt(2));
  const clean = edited();

  clean.pending.value = false;
  await autosave(clean, request).flush();

  const unloaded = copyState();

  unloaded.pending.value = true;
  await expect(autosave(unloaded, request).flush()).rejects.toThrow(
    'Your latest edits'
  );

  expect(request).not.toHaveBeenCalled();
});

it('flush drains edits typed during the request before authorizing publication', async () => {
  const state = edited();
  const sent: number[] = [];
  let release = () => {};
  const saver = autosave(state, payload => {
    sent.push(payload.revision);

    return sent.length === 1
      ? new Promise(done => {
          release = () => done(copyAt(2));
        })
      : Promise.resolve(copyAt(3));
  });
  const flushed = saver.flush();

  await vi.advanceTimersByTimeAsync(0);
  state.pending.value = true;
  release();
  await flushed;

  expect(sent).toEqual([1, 2]);
  expect(state.pending.value).toBe(false);
});

it('times out a stuck save and stops scheduling after disposal', async () => {
  const state = edited();
  const saver = autosave(state, () => new Promise(() => {}));
  const blocked = expect(saver.flush()).rejects.toThrow('Saving took too long');

  await vi.advanceTimersByTimeAsync(10_000);
  await blocked;
  expect(state.error.value).toContain('Saving took too long');

  const request = vi.fn(async () => copyAt(2));
  const stopped = autosave(edited(), request);

  stopped.schedule();
  stopped.dispose();
  await vi.advanceTimersByTimeAsync(SAVE_PAUSE_MS);
  expect(request).not.toHaveBeenCalled();
});
