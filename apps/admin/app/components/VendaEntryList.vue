<script setup lang="ts">
import type { CollectionSchema } from '@venda/schema';
import type { Entry } from '~/types';

const props = withDefaults(defineProps<{
  entries: Entry[];
  schema: CollectionSchema;
  canDelete?: (entry: Entry) => boolean;
  /** Rows are trashed entries: offer restore and permanent deletion instead of editing. */
  trash?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}>(), { canDelete: () => true, trash: false, emptyTitle: 'No entries yet', emptyDescription: 'Create the first entry for this collection.' });

const emit = defineEmits<{
  edit: [entry: Entry];
  delete: [entry: Entry];
  restore: [entry: Entry];
  purge: [entry: Entry];
}>();

function badge(entry: Entry): { label: string; color: 'success' | 'warning' | 'info' | 'neutral' } {
  if (entry.status === 'published') return entry.hasUnpublishedChanges ? { label: 'Unpublished changes', color: 'warning' } : { label: 'Published', color: 'success' };
  if (entry.publishAt) return { label: `Scheduled ${new Date(entry.publishAt).toLocaleDateString()}`, color: 'info' };
  return { label: 'Draft', color: 'neutral' };
}

// A readable one-line summary: the first filled text field after the title
// (rich text shown as plain text, never raw HTML).
function preview(data: Record<string, unknown>): string {
  for (const field of props.schema.fields) {
    if (field.key === props.schema.titleField) continue;
    const value = data[field.key];
    const text = field.interface === 'wysiwyg' ? richTextPreview(value) : typeof value === 'string' ? value.trim() : '';
    if (text && ['input', 'textarea', 'wysiwyg'].includes(field.interface)) return text;
  }
  return Object.keys(data).length ? `${Object.keys(data).length} fields` : 'No content yet';
}

function meta(entry: Entry): string {
  if (entry.deletedAt) return `/${entry.slug} · Trashed ${new Date(entry.deletedAt).toLocaleDateString()}`;
  return `/${entry.slug} · Updated ${new Date(entry.updatedAt).toLocaleDateString()}`;
}
</script>

<template>
  <UEmpty
    v-if="!entries.length"
    :icon="trash ? 'i-lucide-trash-2' : 'i-lucide-file-plus-2'"
    :title="emptyTitle"
    :description="emptyDescription"
    class="rounded-lg border border-dashed border-default py-16"
  />

  <div v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
    <div
      v-for="entry in entries"
      :key="entry.id"
      :data-slug="entry.slug"
      class="flex flex-col gap-4 bg-default p-4 transition-colors hover:bg-elevated/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-primary" aria-hidden="true" />
          <p class="truncate font-semibold text-highlighted">{{ entryTitle(schema, entry) }}</p>
          <UBadge v-if="!trash" :color="badge(entry).color" variant="subtle" size="xs" :label="badge(entry).label" />
        </div>
        <p class="mt-1 truncate text-sm text-muted">{{ preview(entry.data) }}</p>
        <p class="mt-1 font-mono text-xs text-dimmed">{{ meta(entry) }}</p>
      </div>

      <div v-if="trash" class="flex shrink-0 gap-2">
        <UButton v-if="canDelete(entry)" label="Restore" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" size="sm" @click="emit('restore', entry)" />
        <UButton v-if="canDelete(entry)" label="Delete forever" icon="i-lucide-trash-2" color="error" variant="soft" size="sm" @click="emit('purge', entry)" />
      </div>
      <div v-else class="flex shrink-0 gap-2">
        <UButton
          label="Open editor"
          icon="i-lucide-square-pen"
          color="neutral"
          variant="outline"
          size="sm"
          :aria-label="`Open ${entryTitle(schema, entry)} in the editor`"
          @click="emit('edit', entry)"
        />
        <UButton v-if="canDelete(entry)" label="Trash" icon="i-lucide-trash-2" color="error" variant="soft" size="sm" @click="emit('delete', entry)" />
      </div>
    </div>
  </div>
</template>
