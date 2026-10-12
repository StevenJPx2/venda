<script setup lang="ts">
import type { FieldProps } from './values';

// On or off.
defineProps<FieldProps>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <USwitch
    :model-value="modelValue === true"
    :disabled="readonly"
    @update:model-value="value => emit('update:modelValue', value === true)"
  />
</template>
