<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { computed, onMounted, ref } from 'vue';
import { entryTitle } from './text';

const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();

const search = ref('');
const moreBusy = ref(false);

const collections = useAdminResource(() => admin.request(admin.api.adminContent.collections()));
const entries = useAdminResource(() => admin.request(admin.api.adminContent.entries({ params: { collection: props.params.collection ?? '' }, query: { q: search.value } })));
const collection = computed(() => collections.data.value?.find(item => item.slug === props.params.collection));

onMounted(async () => {
  await collections.reload();

  if (props.params.collection) await entries.reload();
});

async function more() {
  const cursor = entries.data.value?.nextCursor;

  if (!cursor || moreBusy.value) return;

  moreBusy.value = true;

  await entries.perform(async () => {
    const next = await admin.request(admin.api.adminContent.entries({ params: { collection: props.params.collection ?? '' }, query: { cursor, q: search.value } }));

    if (entries.data.value) entries.data.value = { items: [...entries.data.value.items, ...next.items], nextCursor: next.nextCursor };
  });
  moreBusy.value = false;
}
</script>

<template>
  <AdminScreenHeader :title="collection?.name ?? 'Content'" :description="props.params.collection ? 'Your content files. Editing and publishing arrive with the write path.' : 'Writing, pages and structured content from your repository.'">
    <UButton v-if="props.params.collection" to="/content" label="All collections" icon="i-lucide-arrow-left" variant="ghost" color="neutral" />
  </AdminScreenHeader>

  <AdminFeedback :busy="collections.busy.value" :error="collections.error.value" :empty="collections.data.value?.length === 0" title="No collections yet" description="Add a collection folder with config.ts and a Markdown entry." @retry="collections.reload" />

  <div v-if="!props.params.collection" class="list-surface">
    <NuxtLink v-for="item in collections.data.value" :key="item.slug" :to="`/content/${encodeURIComponent(item.slug)}`" class="content-row">
      <div class="min-w-0 flex-1">
        <span class="font-medium text-highlighted break-words">{{ item.name }}</span>
        <p class="text-xs text-muted mt-1 break-all">content/{{ item.slug }}/</p>
      </div>

      <span class="text-xs text-muted shrink-0 capitalize">{{ item.kind }}</span>
      <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
    </NuxtLink>
  </div>

  <template v-else>
    <form class="mb-5 flex gap-2 max-w-md" role="search" @submit.prevent="entries.reload">
      <UInput v-model="search" aria-label="Search entries" placeholder="Search entries" icon="i-lucide-search" class="flex-1" />
      <UButton type="submit" label="Search" color="neutral" variant="outline" />
    </form>

    <AdminFeedback :busy="entries.busy.value" :error="entries.error.value" :empty="entries.data.value?.items.length === 0" title="No entries found" description="Try another search, or add an entry file to this collection." @retry="entries.reload" />

    <div class="list-surface">
      <NuxtLink v-for="entry in entries.data.value?.items" :key="entry.slug" :to="`/content/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.slug)}`" class="content-row">
        <div class="min-w-0 flex-1"><p class="font-medium text-highlighted break-words">{{ entryTitle(entry, collection?.titleField ?? null) }}</p><p class="text-xs text-muted mt-1 break-all">{{ entry.slug }}</p></div>
        <span class="entry-state" :data-state="entry.state"><span />{{ entry.state === 'future' ? 'Future dated' : entry.state }}</span>
      </NuxtLink>
    </div>

    <UButton v-if="entries.data.value?.nextCursor" label="Load more" :loading="moreBusy" color="neutral" variant="outline" class="mt-6" @click="more" />
  </template>
</template>
