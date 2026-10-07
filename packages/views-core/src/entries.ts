// What every browsing view does with a collection's entries: search as you
// type (the latest query wins), page through them in the kind's order, and
// say when it is loading, refreshing or empty.
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { entryTitle } from './text';

// Long enough to skip a request per keystroke, short enough to feel live.
const SEARCH_PAUSE_MS = 200;

export function useEntryList(collection: CollectionSummary) {
  const admin = useAdmin();
  const search = ref('');
  const loadMore = useAdminAction();
  let pending: ReturnType<typeof setTimeout> | undefined;

  const read = (cursor: string | undefined) =>
    admin.request(
      admin.api.adminContent.entries({
        params: { collection: collection.slug },
        query: cursor ? { cursor, q: search.value } : { q: search.value }
      })
    );

  const entries = useAdminResource(() => read(undefined));

  // A first load shows the loading line; a refresh keeps the old list, dimmed, until the new one lands.
  const firstLoad = computed(() => entries.busy.value && !entries.data.value);
  const refreshing = computed(
    () => entries.busy.value && Boolean(entries.data.value)
  );
  const empty = computed(
    () => !entries.busy.value && entries.data.value?.items.length === 0
  );

  onMounted(entries.reload);
  onUnmounted(() => clearTimeout(pending));

  // Clearing answers at once; typing waits for a short pause.
  watch(search, value => {
    clearTimeout(pending);
    pending = setTimeout(entries.reload, value ? SEARCH_PAUSE_MS : 0);
  });

  function searchNow() {
    clearTimeout(pending);
    void entries.reload();
  }

  async function more() {
    const page = entries.data.value;
    const cursor = page?.nextCursor;

    if (!cursor) return;

    await loadMore.perform(async () => {
      const next = await read(cursor);

      // A search that finished meanwhile replaced the list; this page belongs to the old one.
      if (entries.data.value === page)
        entries.data.value = {
          items: [...page.items, ...next.items],
          nextCursor: next.nextCursor
        };
    });
  }

  return {
    search,
    entries,
    loadMore,
    firstLoad,
    refreshing,
    empty,
    searchNow,
    more
  };
}

/** The route of one entry's screen. */
const entryPath = (collection: string, slug: string) =>
  `/content/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`;

/** What any view's row for an entry starts from: its key, its link and its title. */
export const entryLink = (
  entry: IndexedEntry,
  collection: CollectionSummary
) => ({
  slug: entry.slug,
  to: entryPath(entry.collection, entry.slug),
  title: entryTitle(entry, collection.titleField)
});
