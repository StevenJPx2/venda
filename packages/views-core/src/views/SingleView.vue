<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { computed, onMounted } from 'vue';
import { useCollectionSlots } from '../slots';
import SlotNotice from '../SlotNotice.vue';

// One-of-a-kind content (a home page, site details): no list to pick from,
// so the collection opens straight into its one entry, in its editor.
const props = defineProps<{ collection: CollectionSummary }>();
const admin = useAdmin();
const { editorFor } = useCollectionSlots();

const entries = useAdminResource(() =>
  admin.request(
    admin.api.adminContent.entries({
      params: { collection: props.collection.slug },
      query: {}
    })
  )
);

onMounted(entries.reload);

const entry = computed(() => entries.data.value?.items[0]);
const editor = computed(() => editorFor(props.collection));
const missing = computed(() => !entries.busy.value && !entry.value);
</script>

<template>
  <AdminFeedback
    :busy="entries.busy.value"
    :error="entries.error.value"
    :empty="missing"
    title="Nothing here yet"
    description="Add this collection's one entry as index.md in its folder."
    @retry="entries.reload"
  />

  <template v-if="entry">
    <SlotNotice :shown="editor" part="editor" :kind="collection.kind" />

    <component
      :is="editor.component"
      v-if="editor.component"
      :collection="collection"
      :entry="entry"
    />
  </template>
</template>
