<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { computed, onMounted } from 'vue';
import { useCollection } from './collection';
import { useCollectionSlots } from './slots';
import SlotNotice from './SlotNotice.vue';
import { stateLabel } from './text';

// One entry's screen: the way back and its status, then whichever editor the
// collection's kind or its config.ts chooses (the writer, a form).
const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();
const collectionSlug = props.params.collection ?? '';
const { collections, collection, pending } = useCollection(collectionSlug);
const { editorFor } = useCollectionSlots();

const entries = useAdminResource(() =>
  admin.request(
    admin.api.adminContent.entry({
      params: { collection: collectionSlug, slug: props.params.slug ?? '' }
    })
  )
);
const entry = entries.data;

onMounted(entries.reload);

// The way back is named for where it leads. Until the name arrives its space is
// held blank, so the label never visibly changes from a placeholder to the name.
const back = computed(() => ({
  to: `/content/${encodeURIComponent(collectionSlug)}`,
  label: collection.value?.name ?? 'Entries'
}));
const failure = computed(() => entries.error.value || collections.error.value);
const missing = computed(() => !entries.busy.value && !entry.value);
const editor = computed(() =>
  collection.value ? editorFor(collection.value) : undefined
);
</script>

<template>
  <div class="entry-bar">
    <NuxtLink :to="back.to" class="back-link">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />

      <span :class="{ invisible: pending }">{{ back.label }}</span>
    </NuxtLink>

    <p v-if="entry" class="entry-state" :data-state="entry.state">
      <span />{{ stateLabel(entry.state) }} · read-only
    </p>
  </div>

  <AdminFeedback
    :busy="entries.busy.value"
    :error="failure"
    :empty="missing"
    title="Entry not found"
    description="It may have been removed, or it is not visible to your role."
    @retry="entries.reload"
  />

  <template v-if="collection && entry && editor">
    <SlotNotice :shown="editor" part="editor" :kind="collection.kind" />

    <component
      :is="editor.component"
      v-if="editor.component"
      :collection="collection"
      :entry="entry"
    />
  </template>
</template>
