// Flush typed edits before changing file state. The API preserves saved work;
// trash then clears this screen before navigating to the collection.
import type { AdminRuntime } from '@venda/admin';
import type { EntryRef, WorkingCopy } from '@venda/contract';
import type { Ref } from 'vue';

interface LifecycleEditor {
  readonly params: EntryRef;
  readonly copy: Ref<WorkingCopy | undefined>;
  readonly flush: () => Promise<void>;
  readonly adopt: (copy: WorkingCopy) => void;
  readonly clear: () => void;
}

export function entryLifecycle(admin: AdminRuntime, editor: LifecycleEditor) {
  const api = admin.api.contentLifecycle;
  const input = () => {
    const copy = editor.copy.value;

    if (!copy?.currentSha) throw new Error('This entry has no file yet.');

    return {
      params: editor.params,
      payload: { revision: copy.revision, sha: copy.currentSha }
    };
  };

  return {
    async unpublish() {
      await editor.flush();
      editor.adopt(await admin.request(api.unpublish(input())));
    },
    async republish() {
      await editor.flush();
      editor.adopt(await admin.request(api.republish(input())));
    },
    async trash() {
      await editor.flush();
      await admin.request(api.trash(input()));
      editor.clear();
      await admin.navigate(
        `/content/${encodeURIComponent(editor.params.collection)}`
      );
    }
  };
}
