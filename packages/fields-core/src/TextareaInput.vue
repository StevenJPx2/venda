<script setup lang="ts">
import { textOf, textValue, type FieldProps } from './values';

// Several lines of plain text, growing as they are written.
defineProps<FieldProps>();

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
</script>

<template>
  <UTextarea
    :model-value="textOf(modelValue)"
    :maxlength="field.max ?? undefined"
    :readonly="readonly"
    autoresize
    class="w-full"
    @update:model-value="
      value => emit('update:modelValue', textValue(String(value)))
    "
  />
</template>
