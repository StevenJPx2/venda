<script setup lang="ts">
import type { FieldValue } from '@venda/admin';
import { shallowRef, watch } from 'vue';
import { jsonText, jsonValue, type FieldProps } from './values';

// Structured data as JSON. The value changes only when the text parses, so a
// half-typed object never replaces the last good one.
const props = defineProps<FieldProps>();
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue | null] }>();
const text = shallowRef(jsonText(props.modelValue));
const invalid = shallowRef(false);

watch(
  () => props.modelValue,
  value => {
    const shown = JSON.stringify(jsonValue(text.value) ?? null);

    if (!invalid.value && shown !== JSON.stringify(value))
      text.value = jsonText(value);
  }
);

function onInput(next: string) {
  const value = jsonValue(next);

  text.value = next;
  invalid.value = value === undefined;

  if (value !== undefined) emit('update:modelValue', value);
}
</script>

<template>
  <UTextarea
    :model-value="text"
    :readonly="readonly"
    :color="invalid ? 'error' : 'primary'"
    autoresize
    class="w-full font-mono"
    @update:model-value="value => onInput(String(value))"
  />

  <p v-if="invalid" role="alert" class="mt-1 text-xs text-error">
    Not valid JSON yet; the last valid value is kept.
  </p>
</template>
