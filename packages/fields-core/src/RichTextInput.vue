<script setup lang="ts">
import { RichTextEditor } from '@venda/editor-kit';
import { isRichTextDoc } from '@venda/richtext';
import { computed } from 'vue';
import type { FieldProps } from './values';

// The body of a record or one-of-a-kind entry, framed like the other inputs.
const props = defineProps<FieldProps>();
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();
const doc = computed(() =>
  isRichTextDoc(props.modelValue) ? props.modelValue : null
);
</script>

<template>
  <div class="form-richtext">
    <RichTextEditor
      :model-value="doc"
      :readonly="readonly"
      @update:model-value="value => emit('update:modelValue', value)"
    />
  </div>
</template>
