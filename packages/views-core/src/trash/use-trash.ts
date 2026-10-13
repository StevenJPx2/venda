import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import { EntryRef, type TrashedEntry } from '@venda/contract';
import { Schema } from 'effect';
import { onMounted, shallowRef } from 'vue';
import { entryPath } from '../entries';

const decodeRef = Schema.decodeUnknownSync(EntryRef);

/** Trash paging and restoration use the server's visibility and revision guards. */
export function useTrash() {
  const admin = useAdmin();
  const moreAction = useAdminAction();
  const restoreAction = useAdminAction();
  const selected = shallowRef<TrashedEntry | null>(null);
  const read = (cursor?: string) =>
    admin.request(
      admin.api.contentLifecycle.listTrash({ query: cursor ? { cursor } : {} })
    );
  const entries = useAdminResource(() => read());

  onMounted(entries.reload);

  const more = () =>
    moreAction.perform(async () => {
      const page = entries.data.value;

      if (!page?.nextCursor) return;

      const next = await read(page.nextCursor);

      if (entries.data.value === page)
        entries.data.value = {
          items: [...page.items, ...next.items],
          nextCursor: next.nextCursor
        };
    });
  const pick = (entry: TrashedEntry) => {
    restoreAction.error.value = '';
    selected.value = entry;
  };
  const restore = () =>
    restoreAction.perform(async () => {
      const entry = selected.value;

      if (!entry) return;

      await admin.request(
        admin.api.contentLifecycle.restore({
          params: decodeRef({ collection: entry.collection, slug: entry.slug }),
          payload: { revision: entry.revision }
        })
      );
      selected.value = null;
      await admin.navigate(entryPath(entry.collection, entry.slug));
    });

  return { entries, selected, moreAction, restoreAction, more, pick, restore };
}
