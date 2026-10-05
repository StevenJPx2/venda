<script setup lang="ts">
import type { EntryStatus } from '~/types';
import type { SaveState } from '~/composables/useEntryDraft';

// Ghost-style chrome: back to the collection, save and publication state, actions.
const props = defineProps<{
  collectionName: string;
  entryTitle: string;
  backTo: string;
  status: EntryStatus;
  saveState: SaveState;
  /** The working copy differs from what readers see. */
  hasUnpublishedChanges: boolean;
  publishAt: string | null;
  busy: boolean;
  /** Whether the user may publish, unpublish or schedule this entry. */
  canPublish: boolean;
  /** False when the user may not change the entry at all. */
  editable: boolean;
  /** The entry exists on the server (preview and history need it). */
  saved: boolean;
}>();

const emit = defineEmits<{
  publish: [];
  unpublish: [];
  preview: [];
  history: [];
  settings: [];
}>();

const saveLabel = computed(() => ({ new: 'New', saving: 'Saving…', error: 'Not saved', unsaved: 'Unsaved', saved: 'Saved' })[props.saveState]);

const stateLabel = computed(() => {
  if (props.status === 'published') return props.hasUnpublishedChanges ? 'Published · Unpublished changes' : 'Published';
  if (props.publishAt) return `Scheduled for ${new Date(props.publishAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;

  return 'Draft';
});

const stateColor = computed(() => {
  if (props.saveState === 'error') return 'text-error';
  if (props.status === 'published') return props.hasUnpublishedChanges ? 'text-warning' : 'text-success';

  return props.publishAt ? 'text-info' : 'text-muted';
});
</script>

<template>
  <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-default bg-default/90 px-4 backdrop-blur">
    <UButton :to="backTo" icon="i-lucide-chevron-left" :label="collectionName" color="neutral" variant="ghost" size="sm" />
    <span class="h-5 w-px shrink-0 bg-elevated" aria-hidden="true" />
    <span class="min-w-0 truncate text-sm font-medium text-highlighted">{{ entryTitle || 'Untitled entry' }}</span>
    <span class="shrink-0 text-xs" :class="stateColor" data-testid="save-state" aria-live="polite">{{ stateLabel }} · {{ saveLabel }}</span>

    <div class="ml-auto flex items-center gap-1.5">
      <UBadge v-if="!editable" color="neutral" variant="subtle" icon="i-lucide-lock" label="Read only" />
      <UButton icon="i-lucide-history" color="neutral" variant="ghost" size="sm" aria-label="Revision history" :disabled="!saved" @click="emit('history')" />
      <UButton icon="i-lucide-eye" label="Preview" color="neutral" variant="ghost" size="sm" :disabled="busy || !editable" @click="emit('preview')" />
      <template v-if="canPublish">
        <UButton v-if="status === 'published'" label="Unpublish" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="emit('unpublish')" />
        <UButton
          v-if="status === 'draft' || hasUnpublishedChanges"
          :label="status === 'published' ? 'Publish changes' : 'Publish'"
          size="sm"
          :loading="busy"
          :disabled="busy || !editable"
          @click="emit('publish')"
        />
      </template>
      <span v-else-if="editable" class="hidden text-xs text-muted sm:inline">An editor will publish this</span>
      <UButton icon="i-lucide-panel-right" color="neutral" variant="ghost" size="sm" aria-label="Entry settings" @click="emit('settings')" />
    </div>
  </header>
</template>
