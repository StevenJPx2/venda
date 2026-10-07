<script setup lang="ts">
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { computed } from 'vue';
import DocumentPreview from '../DocumentPreview';
import { formRows } from '../form';

// Records and one-of-a-kind content: each field in config.ts order, as the
// form it will be edited in. Read-only until the write path.
const props = defineProps<{
  collection: CollectionSummary;
  entry: IndexedEntry;
}>();

const rows = computed(() => formRows(props.collection, props.entry));
const file = computed(
  () => `content/${props.entry.collection}/${props.entry.slug}`
);
</script>

<template>
  <div class="entry-form">
    <p class="text-xs text-muted break-all">{{ file }}</p>

    <UFormField v-for="row in rows" :key="row.key" :label="row.label">
      <div v-if="row.control.kind === 'richtext'" class="form-richtext">
        <DocumentPreview :content="row.control.doc" />
      </div>

      <USwitch
        v-else-if="row.control.kind === 'switch'"
        :model-value="row.control.on"
        disabled
      />

      <div
        v-else-if="row.control.kind === 'tags'"
        class="flex flex-wrap gap-1.5"
      >
        <UBadge
          v-for="tag in row.control.tags"
          :key="tag"
          :label="tag"
          color="neutral"
          variant="soft"
        />
      </div>

      <UTextarea
        v-else-if="row.control.kind === 'textarea'"
        :model-value="row.control.text"
        readonly
        autoresize
        class="w-full"
      />

      <UInput v-else :model-value="row.control.text" readonly class="w-full" />
    </UFormField>
  </div>
</template>
