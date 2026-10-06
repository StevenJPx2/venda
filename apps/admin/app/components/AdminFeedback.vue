<script setup lang="ts">
defineProps<{
  error?: string;
  busy?: boolean;
  empty?: boolean;
  title?: string;
  description?: string;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div
    v-if="error"
    role="alert"
    class="my-6 rounded-lg border border-error/30 p-4"
  >
    <p class="text-sm text-error">{{ error }}</p>

    <UButton
      class="mt-3"
      label="Try again"
      variant="outline"
      color="neutral"
      @click="$emit('retry')"
    />
  </div>

  <p
    v-else-if="busy"
    role="status"
    class="admin-loading py-8 text-sm text-muted"
  >
    Loading…
  </p>

  <div v-else-if="empty" class="py-16 text-center">
    <p class="text-highlighted font-medium">
      {{ title ?? 'Nothing here yet' }}
    </p>

    <p v-if="description" class="mt-2 text-sm text-muted">{{ description }}</p>
  </div>
</template>
