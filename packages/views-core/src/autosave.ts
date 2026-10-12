// A working copy's state in the browser, and the loop that saves it: after a
// pause in typing, one save at a time, each from the revision the copy is at.
// Another person's save stops autosave until the newer copy is loaded.
import { AdminRequestError, type FieldValue } from '@venda/admin';
import type { WorkingCopy } from '@venda/contract';
import { ref, shallowRef } from 'vue';

// Long enough to skip a request per keystroke, short enough that little is at stake.
export const SAVE_PAUSE_MS = 800;

// Navigation and publication wait for a settled save, never forever.
const FLUSH_WAIT_MS = 10_000;
const FLUSH_SAVES = 4;

export type Data = Record<string, FieldValue>;

export interface SavePayload {
  readonly revision: number;
  readonly data: Data;
  readonly publishedAt: string | null;
}

export type CopyState = ReturnType<typeof copyState>;

export function copyState() {
  return {
    copy: shallowRef<WorkingCopy>(),
    // Editors replace values, never mutate them: retain a document's identity
    // so setting an emitted value back does not reset its selection.
    data: shallowRef<Data>({}),
    publishedAt: ref<string | null>(null),
    forbidden: ref(false),
    elsewhere: ref(false),
    pending: ref(false),
    saving: ref(false),
    error: ref('')
  };
}

export const tagOf = (cause: unknown) =>
  cause instanceof AdminRequestError ? cause.tag : undefined;

const failure = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'The entry could not be saved.';

export function autosave(
  state: CopyState,
  request: (payload: SavePayload) => Promise<WorkingCopy>
) {
  const { copy, pending, saving, error, elsewhere } = state;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  let stopped = false;
  let flushing = false;

  async function send(revision: number) {
    try {
      copy.value = await request({
        revision,
        data: state.data.value,
        publishedAt: state.publishedAt.value
      });
    } catch (cause) {
      pending.value = true;
      elsewhere.value = tagOf(cause) === 'EditedElsewhere';
      error.value = elsewhere.value ? '' : failure(cause);
    }
  }

  async function save(): Promise<void> {
    const current = copy.value;

    if (saving.value) return inFlight;
    if (!pending.value || !current || elsewhere.value) return;

    saving.value = true;
    pending.value = false;
    error.value = '';
    inFlight = send(current.revision).finally(() => {
      saving.value = false;
      retry();
    });

    return inFlight;
  }

  function retry() {
    if (stopped || flushing) return;

    if (pending.value && !elsewhere.value && !error.value) schedule();
  }

  function schedule() {
    if (stopped) return;

    clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_PAUSE_MS);
  }

  /** Stop the queued save and wait for the one already sent (e.g. before discard). */
  async function settle() {
    clearTimeout(timer);

    await bounded(inFlight);
    // The completed save may have scheduled another edit before we resumed.
    clearTimeout(timer);
  }

  async function flush() {
    flushing = true;

    try {
      await settle();
      await drain(state, save);
    } catch (cause) {
      error.value = elsewhere.value ? '' : failure(cause);

      throw cause;
    } finally {
      flushing = false;
    }
  }

  function dispose() {
    stopped = true;
    clearTimeout(timer);
  }

  return { schedule, flush, settle, dispose };
}

/** Saves until nothing is pending, a bounded number of times, or says why not. */
async function drain(state: CopyState, save: () => Promise<void>) {
  const { pending, error, elsewhere } = state;

  for (let attempt = 0; pending.value && attempt < FLUSH_SAVES; attempt++) {
    await bounded(save());

    if (error.value || elsewhere.value) break;
  }

  if (pending.value)
    throw new Error(error.value || 'Your latest edits have not been saved.');
}

/** A timed-out save may finish later, but cannot authorize Publish or navigation. */
async function bounded(work: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error('Saving took too long. Retry before leaving or publishing.')
        ),
      FLUSH_WAIT_MS
    );
  });

  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
