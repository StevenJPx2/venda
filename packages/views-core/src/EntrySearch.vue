<script setup lang="ts">
// The search a browsing view puts above its entries; typing searches.
defineProps<{ loading: boolean }>();

const emit = defineEmits<{ submit: [] }>();
const search = defineModel<string>({ required: true });
</script>

<template>
  <form class="mb-5 max-w-md" role="search" @submit.prevent="emit('submit')">
    <UInput
      v-model="search"
      type="search"
      aria-label="Search entries"
      placeholder="Search entries"
      icon="i-lucide-search"
      :loading="loading"
      class="w-full"
    >
      <template v-if="search" #trailing>
        <UButton
          icon="i-lucide-x"
          aria-label="Clear search"
          color="neutral"
          variant="link"
          size="sm"
          class="-me-1"
          @click="search = ''"
        />
      </template>
    </UInput>
  </form>
</template>
