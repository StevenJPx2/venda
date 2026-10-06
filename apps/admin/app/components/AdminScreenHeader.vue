<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <header class="screen-heading">
    <div class="min-w-0">
      <h1 class="screen-title">{{ title }}</h1>
      <p v-if="description" class="mt-2 text-muted text-sm max-w-xl">{{ description }}</p>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <slot />
    </div>
  </header>
</template>
