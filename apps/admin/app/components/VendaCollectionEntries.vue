<script setup lang="ts">
import type { Collection, Entry } from '~/types';

// One collection's entries: stats, search, the trash, and entry actions.
const props = defineProps<{ collection: Collection; collectionsCount: number }>();

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();

const SEARCH_DELAY_MS = 250;

const view = shallowRef<'entries' | 'trash'>('entries');
const query = shallowRef('');
const entries = shallowRef<Entry[]>([]);
const loading = shallowRef(false);
const error = shallowRef('');

const publishedCount = computed(() => entries.value.filter(entry => entry.status === 'published').length);
const draftCount = computed(() => entries.value.filter(entry => entry.status === 'draft').length);
const searching = computed(() => view.value === 'entries' && query.value.trim().length > 0);

// Responses can arrive out of order while typing; only the latest request may update the list.
let requestId = 0;

async function load(): Promise<void> {
  const current = ++requestId;
  loading.value = true;
  error.value = '';

  try {
    const path = searching.value
      ? `/search?collection=${encodeURIComponent(props.collection.id)}&q=${encodeURIComponent(query.value.trim())}`
      : `/collections/${props.collection.id}/entries${view.value === 'trash' ? '?trash=1' : ''}`;
    const result = await api<Entry[]>(path);

    if (current === requestId) entries.value = result;
  } catch {
    if (current === requestId) error.value = 'Entries could not be loaded.';
  } finally {
    if (current === requestId) loading.value = false;
  }
}

watch(() => props.collection.id, () => { view.value = 'entries'; query.value = ''; void load(); }, { immediate: true });
watch(view, () => { void load(); });
let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(() => void load(), SEARCH_DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(timer));

const canDelete = (entry: Entry) => session.canOn('delete', entry.createdBy) && (entry.status === 'draft' || session.canOn('publish', entry.createdBy));

async function act(run: () => Promise<unknown>, success: string, failure: string): Promise<void> {
  try {
    await run();
    await load();
    toast.add({ title: success, color: 'success' });
  } catch (caught) {
    const detail = (caught as { data?: { error?: string } }).data?.error;
    toast.add({ title: failure, ...(detail ? { description: detail } : {}), color: 'error' });
  }
}

const trashEntry = (entry: Entry) => act(() => api(`/entries/${entry.id}`, { method: 'DELETE' }), 'Moved to trash', 'The entry could not be moved to the trash');
const restoreEntry = (entry: Entry) => act(() => api(`/entries/${entry.id}/restore`, { method: 'POST' }), 'Entry restored as a draft', 'The entry could not be restored');

function purgeEntry(entry: Entry): void {
  if (!window.confirm(`Delete “${entryTitle(props.collection.schema, entry)}” forever? This cannot be undone.`)) return;

  void act(() => api(`/entries/${entry.id}?permanent=true`, { method: 'DELETE' }), 'Entry deleted permanently', 'The entry could not be deleted');
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-3">
      <UCard>
        <p class="text-sm text-muted">Collections</p>
        <p class="mt-2 text-2xl font-semibold text-highlighted">{{ collectionsCount }}</p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">Published entries</p>
        <p class="mt-2 text-2xl font-semibold text-success">{{ view === 'entries' && !searching ? publishedCount : 'n/a' }}</p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">Draft entries</p>
        <p class="mt-2 text-2xl font-semibold text-warning">{{ view === 'entries' && !searching ? draftCount : 'n/a' }}</p>
      </UCard>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-base font-semibold text-highlighted">{{ view === 'trash' ? 'Trash' : 'Entries' }}</p>
            <p class="mt-1 text-sm text-muted">
              {{ view === 'trash' ? 'Trashed entries are deleted after 30 days.' : `/${collection.slug} · ${collection.schema.fields.length} fields` }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UInput v-if="view === 'entries'" v-model="query" icon="i-lucide-search" placeholder="Search entries…" aria-label="Search entries" size="sm" class="w-56" :loading="loading && searching" />
            <UButton :label="view === 'trash' ? 'Back to entries' : 'Trash'" :icon="view === 'trash' ? 'i-lucide-arrow-left' : 'i-lucide-trash-2'" color="neutral" variant="ghost" size="sm" @click="view = view === 'trash' ? 'entries' : 'trash'" />
            <UButton v-if="session.can('schema:manage')" label="Data model" icon="i-lucide-shapes" color="neutral" variant="outline" size="sm" :to="`/collections/${collection.id}/model`" />
            <UButton v-if="session.can('content:create')" label="New entry" icon="i-lucide-plus" size="sm" :to="`/editor/${collection.id}/new`" />
          </div>
        </div>
      </template>

      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" class="m-4" />
      <VendaEntryList
        :entries="entries"
        :schema="collection.schema"
        :trash="view === 'trash'"
        :can-delete="canDelete"
        :empty-title="view === 'trash' ? 'The trash is empty' : searching ? 'No matching entries' : 'No entries yet'"
        :empty-description="view === 'trash' ? 'Entries you move to the trash appear here.' : searching ? 'Try different words.' : 'Create the first entry for this collection.'"
        @edit="entry => navigateTo(`/editor/${entry.collectionId}/${entry.id}`)"
        @delete="trashEntry"
        @restore="restoreEntry"
        @purge="purgeEntry"
      />
    </UCard>
  </div>
</template>
