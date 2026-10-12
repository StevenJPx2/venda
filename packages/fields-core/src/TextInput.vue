<script setup lang="ts">
import { computed } from 'vue';
import { textOf, textValue, type FieldProps } from './values';

// One line of text: plain text, an address, a date, or until their own inputs
// arrive, an image's address and a related entry's slug.
const props = defineProps<FieldProps>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

// Field types with an input type of their own; the rest are plain text.
const KIND = new Map<string, 'url' | 'date'>([
  ['url', 'url'],
  ['image', 'url'],
  ['date', 'date']
]);

const inputType = computed(() => KIND.get(props.field.type) ?? 'text');
</script>

<template>
  <UInput
    :model-value="textOf(modelValue)"
    :type="inputType"
    :maxlength="field.max ?? undefined"
    :readonly="readonly"
    class="w-full"
    @update:model-value="
      value => emit('update:modelValue', textValue(String(value)))
    "
  />
</template>
