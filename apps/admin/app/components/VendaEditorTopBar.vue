<script setup lang="ts">
import type { EntryStatus } from '~/types';
import type { SaveState } from '~/composables/useEntryDraft';

// Minimal Ghost-style chrome: back to the collection, save state, publish.
const props = defineProps<{
  collectionName: string;
  entryTitle: string;
  backTo: string;
  status: EntryStatus;
  saveState: SaveState;
  dirty: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  publish: [];
  update: [];
  unpublish: [];
  settings: [];
}>();

const stateLabel = computed(() => {
  const prefix = props.status === 'published' ? 'Published' : 'Draft';
  const labels: Record<SaveState, string> = {
    new: 'New',
    saving: `${prefix} · Saving…`,
    error: `${prefix} · Not saved`,
    unsaved: props.status === 'published' ? 'Published · Unsaved changes' : 'Draft · Unsaved',
    saved: `${prefix} · Saved`
  };
  return labels[props.saveState];
});

const stateColor = computed(() => (props.saveState === 'error' ? 'text-error' : props.status === 'published' ? 'text-success' : 'text-muted'));
</script>

<template>
  <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-default bg-default/90 px-4 backdrop-blur">
    <UButton :to="backTo" icon="i-lucide-chevron-left" :label="collectionName" color="neutral" variant="ghost" size="sm" />
    <span class="h-5 w-px shrink-0 bg-elevated" aria-hidden="true" />
    <span class="shrink-0 text-xs text-muted">Editing</span>
    <span class="min-w-0 truncate text-sm font-medium text-highlighted">{{ entryTitle || 'Untitled entry' }}</span>
    <span class="shrink-0 text-xs" :class="stateColor" data-testid="save-state" aria-live="polite">{{ stateLabel }}</span>

    <div class="ml-auto flex items-center gap-2">
      <template v-if="status === 'published'">
        <UButton label="Unpublish" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="emit('unpublish')" />
        <UButton label="Update" size="sm" :disabled="!dirty || busy" :loading="busy && saveState === 'saving'" @click="emit('update')" />
      </template>
      <UButton v-else label="Publish" size="sm" :loading="busy && saveState === 'saving'" :disabled="busy" @click="emit('publish')" />
      <UButton icon="i-lucide-panel-right" color="neutral" variant="ghost" size="sm" aria-label="Entry settings" @click="emit('settings')" />
    </div>
  </header>
</template>
