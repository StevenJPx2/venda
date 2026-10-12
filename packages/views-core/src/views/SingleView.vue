<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { computed, onMounted } from 'vue';
import EntryEditing from '../EntryEditing.vue';
import NewEntry from '../NewEntry.vue';

// One-of-a-kind content (a home page, site details): no list to pick from,
// so the collection opens straight into its one entry, being edited.
const props = defineProps<{ collection: CollectionSummary }>();
const admin = useAdmin();

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
const missing = computed(() => !entries.busy.value && !entry.value);
</script>

<template>
  <AdminFeedback
    v-if="!entry"
    :busy="entries.busy.value"
    :error="entries.error.value"
    :empty="missing"
    title="Nothing here yet"
    description="This collection holds one entry. Create it to start writing."
    @retry="entries.reload"
  />

  <NewEntry v-if="missing" :collection="collection" label="Create it" />

  <EntryEditing
    v-if="entry"
    :key="entry.slug"
    :collection="collection"
    :slug="entry.slug"
    :entry="entry"
    @file-changed="entries.reload"
  />
</template>
