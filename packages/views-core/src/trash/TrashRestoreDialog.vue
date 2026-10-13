<script setup lang="ts">
import type { TrashedEntry } from '@venda/contract';
import { computed } from 'vue';

const props = defineProps<{
  entry: TrashedEntry | null;
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; restore: [] }>();
const open = computed({
  get: () => props.entry !== null,
  set: value => {
    if (!value) emit('close');
  }
});
</script>

<template>
  <AdminConfirm
    v-model:open="open"
    :title="`Restore ${entry?.title ?? 'this entry'}?`"
    description="The file returns as a draft. Its ownership and saved edits are kept. Publish it when you are ready."
    label="Restore as draft"
    :busy="busy"
    :error="error"
    @confirm="emit('restore')"
  />
</template>
