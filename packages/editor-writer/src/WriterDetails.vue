<script setup lang="ts">
import { useFieldInputs, type EntryEdit, type FieldValue } from '@venda/admin';
import type { CollectionField, CollectionSummary } from '@venda/contract';
import { FieldList } from '@venda/editor-kit';
import { computed } from 'vue';
import { textOf } from './text';

// Everything about an entry that is not its words: the file, when it
// publishes, and the rest of its fields, each in its installed input.
const props = defineProps<{
  collection: CollectionSummary;
  edit: EntryEdit;
}>();

const inputFor = useFieldInputs();

const publishDate = {
  key: 'publishedAt',
  type: 'datetime',
  label: 'Publish date',
  help: null,
  required: false,
  options: null,
  min: null,
  max: null
} satisfies CollectionField;

const dateInput = inputFor(publishDate.type);
const file = computed(
  () => `content/${props.collection.slug}/${props.edit.slug}`
);

// The title and body are on the canvas.
const onCanvas = computed(
  () => new Set([props.collection.titleField, props.collection.bodyField])
);

const panelFields = computed(() =>
  props.collection.fields.filter(field => !onCanvas.value.has(field.key))
);

const setPublishedAt = (value: FieldValue | null) =>
  props.edit.setPublishedAt(textOf(value));
</script>

<template>
  <div class="writer-details">
    <p class="text-xs text-muted break-all">{{ file }}</p>

    <UFormField :label="publishDate.label">
      <component
        :is="dateInput"
        v-if="dateInput"
        :field="publishDate"
        :model-value="edit.publishedAt"
        :readonly="edit.readonly"
        @update:model-value="setPublishedAt"
      />

      <p v-else class="text-sm text-muted">
        No input is installed for datetime fields.
      </p>
    </UFormField>

    <FieldList :fields="panelFields" :edit="edit" />
  </div>
</template>

<style scoped>
.writer-details {
  display: grid;
  gap: 20px;
}
</style>
