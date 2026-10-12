<script setup lang="ts">
import { ref } from 'vue';

// The status line and the entry's actions: Publish, and Discard behind a
// menu, with a confirmation, since discarding cannot be undone.
defineProps<{
  status: string;
  dot: string | undefined;
  /** Publish shows only to people who may publish. */
  canPublish: boolean;
  /** There are saved or unsaved changes to publish or discard. */
  changed: boolean;
  /** Nothing can be published here (a read-only server). */
  blocked: boolean;
  editable: boolean;
  isNew: boolean;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{ publish: []; discard: [] }>();
const confirming = ref(false);

const menu = [
  [
    {
      label: 'Discard changes',
      icon: 'i-lucide-undo-2',
      color: 'error' as const,
      onSelect: () => {
        confirming.value = true;
      }
    }
  ]
];
</script>

<template>
  <div class="entry-actions">
    <p v-if="status" class="entry-state" :data-state="dot" aria-live="polite">
      <span />{{ status }}
    </p>

    <UButton
      v-if="canPublish"
      :label="isNew ? 'Publish' : 'Publish changes'"
      :disabled="!changed || blocked"
      :loading="busy && changed"
      @click="emit('publish')"
    />

    <UDropdownMenu v-if="changed && editable" :items="menu">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        aria-label="More actions"
      />
    </UDropdownMenu>
  </div>

  <AdminConfirm
    v-model:open="confirming"
    :title="isNew ? 'Discard this entry?' : 'Discard your changes?'"
    :description="
      isNew
        ? 'This entry has never been published, so it is removed.'
        : 'The entry goes back to the published file. This cannot be undone.'
    "
    label="Discard"
    :busy="busy"
    :error="error"
    @confirm="emit('discard')"
  />
</template>
