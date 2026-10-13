<script setup lang="ts">
import TrashList from './trash/TrashList.vue';
import TrashRestoreDialog from './trash/TrashRestoreDialog.vue';
import { useTrash } from './trash/use-trash';

const trash = useTrash();
</script>

<template>
  <AdminScreenHeader title="Trash">
    <UButton
      label="Refresh"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      :loading="trash.entries.busy.value"
      :disabled="trash.restoreAction.busy.value"
      @click="trash.entries.reload"
    />
  </AdminScreenHeader>

  <AdminFeedback
    :busy="trash.entries.busy.value"
    :error="trash.entries.error.value"
    :empty="trash.entries.data.value?.items.length === 0"
    title="Trash is empty"
    description="Entries you move to trash appear here. Restore them as drafts when you need them."
    @retry="trash.entries.reload"
  />

  <TrashList
    v-if="trash.entries.data.value"
    :items="trash.entries.data.value.items"
    :busy="trash.restoreAction.busy.value"
    @restore="trash.pick"
  />

  <p
    v-if="trash.moreAction.error.value"
    role="alert"
    class="text-sm text-error mt-4"
  >
    {{ trash.moreAction.error.value }}
  </p>

  <UButton
    v-if="trash.entries.data.value?.nextCursor"
    label="Load more"
    color="neutral"
    variant="outline"
    class="mt-4"
    :loading="trash.moreAction.busy.value"
    :disabled="trash.entries.busy.value || trash.restoreAction.busy.value"
    @click="trash.more"
  />

  <TrashRestoreDialog
    :entry="trash.selected.value"
    :busy="trash.restoreAction.busy.value"
    :error="trash.restoreAction.error.value"
    @close="trash.selected.value = null"
    @restore="trash.restore"
  />
</template>
