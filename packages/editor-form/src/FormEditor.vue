<script setup lang="ts">
import type { EntryEdit } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { FieldList } from '@venda/editor-kit';
import { computed } from 'vue';

// Records and one-of-a-kind content: every field in config.ts order, each in
// the input installed for its type. Changes save themselves.
const props = defineProps<{
  collection: CollectionSummary;
  edit: EntryEdit;
}>();

const file = computed(
  () => `content/${props.collection.slug}/${props.edit.slug}`
);
</script>

<template>
  <div class="entry-form">
    <p class="text-xs text-muted break-all">{{ file }}</p>

    <FieldList :fields="collection.fields" :edit="edit" />
  </div>
</template>
