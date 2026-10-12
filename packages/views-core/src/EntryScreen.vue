<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { computed, onMounted } from 'vue';
import { useCollection } from './collection';
import EntryEditing from './EntryEditing.vue';

// One entry's screen: the way back, then the entry being edited in whichever
// editor the collection's kind or its config.ts chooses.
const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();
const collectionSlug = props.params.collection ?? '';
const slug = props.params.slug ?? '';
const { collections, collection, pending } = useCollection(collectionSlug);

const entries = useAdminResource(() =>
  admin.request(
    admin.api.adminContent.entry({
      params: { collection: collectionSlug, slug }
    })
  )
);

onMounted(entries.reload);

// The way back is named for where it leads. Until the name arrives its space is
// held blank, so the label never visibly changes from a placeholder to the name.
const back = computed(() => ({
  to: `/content/${encodeURIComponent(collectionSlug)}`,
  label: collection.value?.name ?? 'Entries'
}));
const failure = computed(() => entries.error.value || collections.error.value);
const missing = computed(() => !entries.busy.value && !entries.data.value);
</script>

<template>
  <AdminFeedback
    v-if="!entries.data.value"
    :busy="entries.busy.value"
    :error="failure"
    :empty="missing"
    title="Entry not found"
    description="It may have been removed, or it is not visible to your role."
    @retry="entries.reload"
  />

  <EntryEditing
    v-if="collection && entries.data.value"
    :key="`${collectionSlug}/${slug}`"
    :collection="collection"
    :slug="slug"
    :entry="entries.data.value"
    @file-changed="entries.reload"
  >
    <template #back>
      <NuxtLink :to="back.to" class="back-link">
        <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />

        <span :class="{ invisible: pending }">{{ back.label }}</span>
      </NuxtLink>
    </template>
  </EntryEditing>
</template>
