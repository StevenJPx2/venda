<script setup lang="ts">
import type { CollectionSchema } from '@venda/schema';
import type { Entry } from '~/types';

const props = defineProps<{
  entries: Entry[];
  schema: CollectionSchema;
}>();

const emit = defineEmits<{
  edit: [entry: Entry];
  delete: [entry: Entry];
}>();

function statusColor(status: Entry['status']): 'success' | 'warning' {
  return status === 'published' ? 'success' : 'warning';
}

// A readable one-line summary: the first filled text field after the title
// (rich text shown as plain text, never raw HTML).
function preview(data: Record<string, unknown>): string {
  for (const field of props.schema.fields) {
    if (field.key === props.schema.titleField) continue;
    const value = data[field.key];
    if (typeof value !== 'string') continue;
    const text = field.interface === 'wysiwyg' ? plainText(value) : value.trim();
    if (text && ['input', 'textarea', 'wysiwyg'].includes(field.interface)) return text;
  }
  return Object.keys(data).length ? `${Object.keys(data).length} fields` : 'No content yet';
}
</script>

<template>
  <UEmpty
    v-if="!entries.length"
    icon="i-lucide-file-plus-2"
    title="No entries yet"
    description="Create the first entry for this collection below."
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
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-primary" />
          <p class="truncate font-semibold text-highlighted">{{ entryTitle(schema, entry) }}</p>
          <UBadge :color="statusColor(entry.status)" variant="subtle" size="xs" class="capitalize">
            {{ entry.status }}
          </UBadge>
        </div>
        <p class="mt-1 truncate text-sm text-muted">{{ preview(entry.data) }}</p>
        <p class="mt-1 font-mono text-xs text-dimmed">/{{ entry.slug }} · Updated {{ new Date(entry.updatedAt).toLocaleDateString() }}</p>
      </div>

      <div class="flex shrink-0 gap-2">
        <UButton
          label="Open editor"
          icon="i-lucide-square-pen"
          color="neutral"
          variant="outline"
          size="sm"
          :aria-label="`Open ${entryTitle(schema, entry)} in the editor`"
          @click="emit('edit', entry)"
        />
        <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="soft" size="sm" @click="emit('delete', entry)" />
      </div>
    </div>
  </div>
</template>
