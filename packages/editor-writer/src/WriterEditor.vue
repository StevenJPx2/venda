<script setup lang="ts">
import type { EntryEdit, FieldValue } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { isRichTextDoc, type RichTextDoc } from '@venda/richtext';
import { computed, shallowRef, useTemplateRef } from 'vue';
import { coverFieldOf } from './cover';
import { textOf } from './text';
import { useWritingFocus } from './useWritingFocus';
import WriterBody from './WriterBody.vue';
import WriterCover from './WriterCover.vue';
import WriterDetails from './WriterDetails.vue';
import WriterTitle from './WriterTitle.vue';

// Posts and pages: the title and body on a quiet canvas, everything else in a
// panel beside them (a sheet on narrow screens). The controls fade while
// someone writes. Every change saves itself through the edit.
const props = defineProps<{
  collection: CollectionSummary;
  edit: EntryEdit;
}>();

const bodyPart = useTemplateRef<InstanceType<typeof WriterBody>>('writerBody');
const focus = useWritingFocus();
const detailsOpen = shallowRef(false);

const title = computed(() => {
  const key = props.collection.titleField;

  return key === null ? null : (textOf(props.edit.data[key]) ?? '');
});

const coverField = computed(() => coverFieldOf(props.collection));
const cover = computed(() =>
  coverField.value === null ? null : textOf(props.edit.data[coverField.value])
);

function setCover(value: string | null): void {
  if (coverField.value !== null) props.edit.set(coverField.value, value);
}

const body = computed(() => {
  const key = props.collection.bodyField;
  const value = key === null ? undefined : props.edit.data[key];

  return isRichTextDoc(value) ? value : null;
});

function setTitle(value: string): void {
  const key = props.collection.titleField;

  if (key !== null) props.edit.set(key, value || null);
}

function setBody(doc: RichTextDoc): void {
  const key = props.collection.bodyField;

  if (key === null) return;

  // RichTextDoc types its attrs as unknown, so it reads as wider than JSON;
  // the round trip is the JSON the entry will save.
  const value: FieldValue = JSON.parse(JSON.stringify(doc));

  props.edit.set(key, value);
}
</script>

<template>
  <div class="writer" :data-typing="focus.typing.value || undefined">
    <div class="entry-tools writer-chrome">
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
      <article class="entry-preview writer-canvas">
        <WriterCover
          v-if="coverField !== null"
          :model-value="cover"
          :readonly="edit.readonly"
          @update:model-value="setCover"
        />

        <WriterTitle
          v-if="title !== null"
          :model-value="title"
          :readonly="edit.readonly"
          @update:model-value="setTitle"
          @enter="bodyPart?.focusStart()"
          @typing="focus.start"
        />

        <WriterBody
          v-if="collection.bodyField !== null"
          ref="writerBody"
          class="writer-body-gap"
          :model-value="body"
          :readonly="edit.readonly"
          @update:model-value="setBody"
          @typing="focus.start"
        />
      </article>

      <aside class="entry-panel writer-chrome" aria-label="Entry details">
        <WriterDetails :collection="collection" :edit="edit" />
      </aside>
    </div>

    <USlideover
      v-model:open="detailsOpen"
      side="right"
      title="Entry details"
      description="The file, its publish date and its fields."
      :ui="{ content: 'max-w-sm' }"
    >
      <template #body>
        <WriterDetails :collection="collection" :edit="edit" />
      </template>
    </USlideover>
  </div>
</template>

<style scoped>
.writer-canvas {
  padding-top: 8vh;
}
.writer-body-gap {
  margin-top: 2rem;
}

/* Leaving is ambient (the writer is looking at the text), so it takes its
   time; returning answers the pointer, so it is quicker. */
.writer :deep(.writer-chrome) {
  transition: opacity 220ms var(--ease-out);
}
.writer[data-typing] :deep(.writer-chrome) {
  opacity: 0;
  pointer-events: none;
  transition: opacity 280ms ease;
}
</style>
