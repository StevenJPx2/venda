<script setup lang="ts">
import type { CollectionSummary } from '@venda/contract';
import { computed } from 'vue';
import { useEntryList } from './entries';
import EntryPaging from './EntryPaging.vue';
import EntrySearch from './EntrySearch.vue';

// The frame every browsing view shares: search above, loading and empty
// states, the next page below. The view decides only how entries look, in
// its default slot, which receives `items` and `busy`.
const props = defineProps<{
  collection: CollectionSummary;
  emptyTitle: string;
  emptyDescription: string;
}>();
const list = useEntryList(props.collection);
const { search, entries, loadMore } = list;
const items = computed(() => entries.data.value?.items ?? []);
</script>

<template>
  <EntrySearch
    v-model="search"
    :loading="list.refreshing.value"
    @submit="list.searchNow"
  />

  <AdminFeedback
    :busy="list.firstLoad.value"
    :error="entries.error.value"
    :empty="list.empty.value"
    :title="emptyTitle"
    :description="emptyDescription"
    @retry="entries.reload"
  />

  <slot :items="items" :busy="entries.busy.value" />

  <EntryPaging
    :next="Boolean(entries.data.value?.nextCursor)"
    :busy="loadMore.busy.value"
    :error="loadMore.error.value"
    @more="list.more"
  />
</template>
