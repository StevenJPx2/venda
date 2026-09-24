<script setup lang="ts">
import type { Entry } from '~/types';

defineProps<{
  entries: Entry[];
}>();

const emit = defineEmits<{
  edit: [entry: Entry];
  delete: [entry: Entry];
}>();

function statusColor(status: Entry['status']): 'success' | 'warning' {
  return status === 'published' ? 'success' : 'warning';
}

function preview(data: Record<string, unknown>): string {
  return JSON.stringify(data);
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
      class="flex flex-col gap-4 bg-default p-4 transition-colors hover:bg-elevated/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-primary" />
          <p class="truncate font-semibold text-highlighted">{{ entry.slug }}</p>
          <UBadge :color="statusColor(entry.status)" variant="subtle" size="xs" class="capitalize">
            {{ entry.status }}
          </UBadge>
        </div>
        <p class="mt-1 truncate font-mono text-xs text-muted">{{ preview(entry.data) }}</p>
        <p class="mt-1 text-xs text-dimmed">Updated {{ new Date(entry.updatedAt).toLocaleDateString() }}</p>
      </div>

      <div class="flex shrink-0 gap-2">
        <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="outline" size="sm" @click="emit('edit', entry)" />
        <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="soft" size="sm" @click="emit('delete', entry)" />
      </div>
    </div>
  </div>
</template>
