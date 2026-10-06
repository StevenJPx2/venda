<script setup lang="ts">
// `pending` holds the title's space blank until the real one arrives, instead of swapping a placeholder for it.
defineProps<{
  title: string;
  description?: string;
  back?: { to: string; label: string } | undefined;
  pending?: boolean;
}>();
</script>

<template>
  <header class="screen-heading">
    <div class="min-w-0">
      <NuxtLink v-if="back" :to="back.to" class="back-link">
        <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />{{
          back.label
        }}
      </NuxtLink>

      <h1 class="screen-title" :class="{ invisible: pending }">{{ title }}</h1>

      <p v-if="description" class="mt-2 text-muted text-sm max-w-xl">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.default" class="flex items-center gap-2 shrink-0">
      <slot />
    </div>
  </header>
</template>
