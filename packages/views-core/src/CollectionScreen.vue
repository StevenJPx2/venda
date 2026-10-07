<script setup lang="ts">
import { computed } from 'vue';
import { useCollection } from './collection';
import { collectionHeading } from './collections';
import { useCollectionSlots } from './slots';
import SlotNotice from './SlotNotice.vue';

// A collection's screen: its name and description, then whichever view the
// collection's kind or its config.ts chooses (a list, a table, its one entry).
const props = defineProps<{ params: Record<string, string> }>();
const { collections, collection, pending, notFound } = useCollection(
  props.params.collection ?? ''
);
const { viewFor } = useCollectionSlots();

const heading = computed(() => collectionHeading(collection.value));
const view = computed(() =>
  collection.value ? viewFor(collection.value) : undefined
);
</script>

<template>
  <AdminScreenHeader
    :title="heading.title"
    :pending="pending"
    :back="heading.back"
    :description="heading.description"
  />

  <AdminFeedback
    :busy="collections.busy.value"
    :error="collections.error.value"
    :empty="notFound"
    title="Collection not found"
    description="Its folder may have been removed or renamed."
    @retry="collections.reload"
  />

  <template v-if="collection && view">
    <SlotNotice :shown="view" part="view" :kind="collection.kind" />

    <component
      :is="view.component"
      v-if="view.component"
      :key="collection.slug"
      :collection="collection"
    />
  </template>
</template>
