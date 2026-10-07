<script setup lang="ts">
// The foot of a browsing view: the next page, and why it failed if it did.
defineProps<{ next: boolean; busy: boolean; error: string }>();

const emit = defineEmits<{ more: [] }>();
</script>

<template>
  <p v-if="error" role="alert" class="mt-4 text-sm text-error">{{ error }}</p>

  <UButton
    v-if="next"
    label="Load more"
    :loading="busy"
    color="neutral"
    variant="outline"
    class="mt-6"
    @click="emit('more')"
  />
</template>
