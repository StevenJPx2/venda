<script setup lang="ts">
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { isRichTextDoc } from '@venda/richtext';
import { computed, ref } from 'vue';
import DocumentPreview from '../DocumentPreview';
import EntryDetails from '../EntryDetails.vue';
import { dateText, entryTitle, fieldText } from '../text';

// Posts and pages: the words on a canvas, everything else in a panel beside
// them (a sheet on narrow screens). Read-only until the write path.
const props = defineProps<{
  collection: CollectionSummary;
  entry: IndexedEntry;
}>();

const title = computed(() =>
  entryTitle(props.entry, props.collection.titleField)
);

const body = computed(() => {
  const value = props.collection.bodyField
    ? props.entry.data[props.collection.bodyField]
    : undefined;

  return isRichTextDoc(value) ? value : null;
});

const about = computed(
  () =>
    [
      ['File', `content/${props.entry.collection}/${props.entry.slug}`],
      ['Publish date', dateText(props.entry.publishedAt)]
    ] as const
);

const fields = computed(() =>
  Object.entries(props.entry.data)
    .filter(
      ([key]) =>
        key !== props.collection.bodyField &&
        key !== props.collection.titleField
    )
    .map(([key, value]) => [key, fieldText(value)] as const)
);

// Narrow screens open the same panel as a sheet from the right, where its button sits.
const detailsOpen = ref(false);
</script>

<template>
  <div class="entry-tools">
    <UButton
      class="entry-details-toggle"
      icon="i-lucide-panel-right"
      aria-label="Entry details"
      color="neutral"
      variant="ghost"
      @click="detailsOpen = true"
    />
  </div>

  <div class="entry-layout">
    <article class="entry-preview">
      <h1 class="preview-title">{{ title }}</h1>
      <DocumentPreview :content="body" />
    </article>

    <aside class="entry-panel" aria-label="Entry details">
      <EntryDetails :about="about" :fields="fields" />
    </aside>
  </div>

  <USlideover
    v-model:open="detailsOpen"
    side="right"
    title="Entry details"
    description="The file and its frontmatter."
    :ui="{ content: 'max-w-sm' }"
  >
    <template #body>
      <EntryDetails :about="about" :fields="fields" />
    </template>
  </USlideover>
</template>
