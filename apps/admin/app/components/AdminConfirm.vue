<script setup lang="ts">
defineProps<{ title: string; description: string; label: string; busy?: boolean; error?: string }>();
const open = defineModel<boolean>('open', { default: false });
defineEmits<{ confirm: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :dismissible="!busy" :ui="{ footer: 'justify-end' }">
    <template #body>
      <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    </template>

    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="open = false" />
      <UButton :label="label" color="error" variant="soft" :loading="busy" @click="$emit('confirm')" />
    </template>
  </UModal>
</template>
