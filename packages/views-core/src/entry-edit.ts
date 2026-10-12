// One entry's working copy as the editors see it. Edits stay local and save
// after a pause, one save at a time, each from the revision it started on.
// Publishing saves first; an outside change keeps the copy until the person
// chooses to keep theirs or take the file's.
import {
  useAdmin,
  useAdminAction,
  type EntryEdit,
  type FieldValue
} from '@venda/admin';
import { EntryRef, type IndexedEntry, type WorkingCopy } from '@venda/contract';
import { Schema } from 'effect';
import { computed, reactive, type ComputedRef } from 'vue';
import {
  autosave,
  copyState,
  tagOf,
  type CopyState,
  type Data
} from './autosave';
import { isReadonly } from './edit-status';

const decodeRef = Schema.decodeUnknownSync(EntryRef);

// Unsetting a field leaves it out of the copy, and so out of the file.
const withValue = (data: Data, key: string, value: FieldValue | null): Data =>
  value === null
    ? Object.fromEntries(Object.entries(data).filter(([name]) => name !== key))
    : { ...data, [key]: value };

/** Shows the file as indexed, read-only, to someone who may not edit it. */
function showIndexed(state: CopyState, entry: IndexedEntry | undefined) {
  state.forbidden.value = true;
  state.data.value = { ...entry?.data };
  state.publishedAt.value = entry?.publishedAt ?? null;
}

/** What an editor sees: the copy's values, and setters that queue a save. */
function editOf(
  state: CopyState,
  slug: string,
  readonly: ComputedRef<boolean>,
  schedule: () => void
): EntryEdit {
  const { data, publishedAt, pending } = state;

  function change(next: () => void) {
    if (readonly.value) return;

    next();
    pending.value = true;
    schedule();
  }

  return reactive({
    slug,
    data,
    publishedAt,
    readonly,
    set: (key: string, value: FieldValue | null) =>
      change(() => {
        data.value = withValue(data.value, key, value);
      }),
    setPublishedAt: (value: string | null) =>
      change(() => {
        publishedAt.value = value;
      })
  });
}

/** `indexed` is the file as indexed, shown read-only to someone who may not edit it. */
export function useEntryEdit(
  collection: string,
  slug: string,
  indexed: () => IndexedEntry | undefined
) {
  const admin = useAdmin();
  const state = copyState();
  const { copy, data, publishedAt, pending } = state;
  const action = useAdminAction();
  const params = decodeRef({ collection, slug });
  const { schedule, flush, settle, dispose } = autosave(state, payload =>
    admin.request(admin.api.contentWrite.save({ params, payload }))
  );

  const adopt = (next: WorkingCopy) => {
    state.forbidden.value = false;
    state.error.value = '';
    copy.value = next;
    data.value = { ...next.data };
    publishedAt.value = next.publishedAt;
    pending.value = false;
  };

  async function load() {
    state.elsewhere.value = false;

    try {
      adopt(await admin.request(admin.api.contentWrite.copy({ params })));
    } catch (cause) {
      if (tagOf(cause) !== 'Forbidden') throw cause;

      showIndexed(state, indexed());
    }
  }

  const readonly = computed(() =>
    isReadonly(copy.value, {
      forbidden: state.forbidden.value,
      elsewhere: state.elsewhere.value,
      busy: action.busy.value
    })
  );

  const edit = editOf(state, slug, readonly, schedule);

  const clear = () => {
    copy.value = undefined;
    pending.value = false;
  };
  const actions = copyActions({
    admin,
    params,
    copy,
    adopt,
    clear,
    flush,
    settle,
    load
  });

  return { ...state, edit, readonly, action, load, flush, dispose, ...actions };
}

interface CopyActionsInput {
  readonly admin: ReturnType<typeof useAdmin>;
  readonly params: EntryRef;
  readonly copy: CopyState['copy'];
  readonly adopt: (copy: WorkingCopy) => void;
  readonly clear: () => void;
  readonly flush: () => Promise<void>;
  readonly settle: () => Promise<void>;
  readonly load: () => Promise<void>;
}

/** Publishing and the two ways out of a conflict, each from the copy's revision. */
function copyActions({
  admin,
  params,
  copy,
  adopt,
  clear,
  flush,
  settle,
  load
}: CopyActionsInput) {
  const revision = () => copy.value?.revision ?? 0;
  const api = admin.api.contentWrite;

  async function publish() {
    await flush();

    try {
      adopt(
        await admin.request(
          api.publish({ params, payload: { revision: revision() } })
        )
      );
    } catch (cause) {
      // The copy now says what changed outside; the person chooses what wins.
      if (tagOf(cause) === 'Conflict') await load();

      throw cause;
    }
  }

  // A new entry has no file to go back to: discarding removes it, so its
  // collection is all that is left to show.
  async function discard() {
    await settle();

    const next = await admin.request(
      api.discard({ params, payload: { revision: revision() } })
    );

    if (next) adopt(next);
    else {
      clear();
      await admin.navigate(`/content/${encodeURIComponent(params.collection)}`);
    }
  }

  // Keep editing mine: the outside version becomes the copy's base, so the
  // next publish replaces it on purpose.
  async function keepMine() {
    await flush();

    const sha = copy.value?.currentSha;

    if (!sha) return;

    copy.value = await admin.request(
      api.rebase({ params, payload: { revision: revision(), sha } })
    );
  }

  return { publish, discard, keepMine };
}
