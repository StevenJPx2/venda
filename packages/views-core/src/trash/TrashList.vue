<script setup lang="ts">
import type { TrashedEntry } from '@venda/contract';

defineProps<{ items: ReadonlyArray<TrashedEntry>; busy: boolean }>();

const emit = defineEmits<{ restore: [entry: TrashedEntry] }>();
</script>

<template>
  <div class="list-surface">
    <div
      v-for="entry in items"
      :key="`${entry.collection}/${entry.slug}`"
      class="trash-row"
    >
      <div class="min-w-0">
        <p class="font-medium truncate">{{ entry.title }}</p>

        <p class="text-sm text-muted">
          {{ entry.collection }}/{{ entry.slug }}
        </p>

        <p class="text-xs text-muted mt-1">
          Trashed {{ entry.trashedAt.slice(0, 16).replace('T', ' ') }} UTC
          <span v-if="entry.hasChanges"> · Saved edits kept</span>
        </p>
      </div>

      <UButton
        v-if="entry.canRestore"
        label="Restore"
        icon="i-lucide-undo-2"
        color="neutral"
        variant="outline"
        :disabled="busy"
        @click="emit('restore', entry)"
      />
    </div>
  </div>
</template>

<style scoped>
.trash-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 12px;
  border-bottom: 1px solid var(--ui-border);
}
</style>
