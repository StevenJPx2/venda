<script setup lang="ts">
const props = defineProps<{ value: string; title: string; description: string }>();
const copied = ref(false);
const error = ref('');

async function copy() {
  error.value = '';

  try {
    await navigator.clipboard.writeText(props.value);
    copied.value = true;
  } catch {
    error.value = 'Copy was unavailable. Select and copy the value below.';
  }
}
</script>

<template>
  <div class="my-6 rounded-lg border border-primary/30 bg-primary/5 p-4" role="status">
    <p class="font-medium text-sm">{{ title }}</p>
    <p class="mt-1 text-sm text-muted">{{ description }}</p>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      <code class="min-w-0 break-all select-all text-xs flex-1">{{ value }}</code>
      <UButton :label="copied ? 'Copied' : 'Copy'" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="outline" @click="copy" />
    </div>

    <p v-if="error" role="alert" class="mt-2 text-sm text-error">{{ error }}</p>
  </div>
</template>
