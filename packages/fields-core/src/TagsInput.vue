<script setup lang="ts">
import { tagsOf, type FieldProps } from './values';

// Short labels, added with Enter and removed one by one.
defineProps<FieldProps>();

const emit = defineEmits<{ 'update:modelValue': [value: string[] | null] }>();
</script>

<template>
  <UInputTags
    :model-value="tagsOf(modelValue)"
    :disabled="readonly"
    class="w-full"
    @update:model-value="
      tags => emit('update:modelValue', tags.length ? tags.map(String) : null)
    "
  />
</template>
