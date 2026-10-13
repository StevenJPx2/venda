<script setup lang="ts">
import { computed } from 'vue';
import { republishesFile, type EntryActionState } from './entry-actions';
import EntryActionsMenu from './EntryActionsMenu.vue';

// The status line and the entry's actions: Publish, and Discard behind a
// menu, with a confirmation, since discarding cannot be undone.
const props = defineProps<
  EntryActionState & {
    status: string;
    dot: string | undefined;
    /** Publish shows only to people who may publish. */
    canPublish: boolean;
    /** There are saved or unsaved changes to publish or discard. */
    changed: boolean;
    editable: boolean;
    isNew: boolean;
    busy: boolean;
    error: string;
  }
>();

const emit = defineEmits<{
  publish: [];
  republish: [];
  discard: [];
  unpublish: [];
  trash: [];
}>();
const republish = computed(() => republishesFile(props));
</script>

<template>
  <div class="entry-actions">
    <p v-if="status" class="entry-state" :data-state="dot" aria-live="polite">
      <span />{{ status }}
    </p>

    <UButton
      v-if="canPublish"
      :label="isNew || republish ? 'Publish' : 'Publish changes'"
      :disabled="!changed && !republish"
      :loading="busy"
      @click="republish ? emit('republish') : emit('publish')"
    />

    <EntryActionsMenu
      :state="state"
      :changed="changed"
      :editable="editable"
      :can-publish="canPublish"
      :is-new="isNew"
      :busy="busy"
      :error="error"
      @discard="emit('discard')"
      @unpublish="emit('unpublish')"
      @trash="emit('trash')"
    />
  </div>
</template>
