<script setup lang="ts">
// The site's name from site.ts, or Venda's mark until it has one.
defineProps<{ name: string | null | undefined }>();
</script>

<template>
  <NuxtLink v-if="name" to="/content" class="brand-mark brand-name">{{
    name
  }}</NuxtLink>

  <NuxtLink v-else to="/content" class="brand-mark"
    >venda<span>.</span></NuxtLink
  >
</template>
