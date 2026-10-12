<script setup lang="ts">
import { numberValue, type FieldProps } from './values';

// A number within the model's bounds; empty unsets it.
defineProps<FieldProps>();

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();
</script>

<template>
  <UInput
    :model-value="typeof modelValue === 'number' ? modelValue : ''"
    type="number"
    :min="field.min ?? undefined"
    :max="field.max ?? undefined"
    :readonly="readonly"
    class="w-full"
    @update:model-value="value => emit('update:modelValue', numberValue(value))"
  />
</template>
