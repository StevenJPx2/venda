<script setup lang="ts">
import { textOf, type FieldProps } from './values';

// One of the choices the model lists.
defineProps<FieldProps>();

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
</script>

<template>
  <USelect
    :model-value="textOf(modelValue)"
    :items="[...(field.options ?? [])]"
    :disabled="readonly"
    placeholder="Choose one"
    class="w-full"
    @update:model-value="
      value => emit('update:modelValue', value ? String(value) : null)
    "
  />
</template>
