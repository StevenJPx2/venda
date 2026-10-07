<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { computed, onMounted } from 'vue';
import { byKind, KIND_ICON } from './collections';

// Every collection, in the sidebar's order and with its icons. A row says
// what the collection holds in its own words, or where its files are.
const admin = useAdmin();
const collections = useAdminResource(() =>
  admin.request(admin.api.adminContent.collections())
);

const rows = computed(() =>
  byKind(collections.data.value ?? []).map(item => ({
    ...item,
    to: `/content/${encodeURIComponent(item.slug)}`,
    note: item.description ?? `content/${item.slug}/`
  }))
);
const empty = computed(() => collections.data.value?.length === 0);

onMounted(collections.reload);
</script>

<template>
  <AdminScreenHeader
    title="Content"
    description="Writing, pages and structured content from your repository."
  />

  <AdminFeedback
    :busy="collections.busy.value"
    :error="collections.error.value"
    :empty="empty"
    title="No collections yet"
    description="Add a collection folder with config.ts and a Markdown entry."
    @retry="collections.reload"
  />

  <div class="list-surface">
    <NuxtLink
      v-for="item in rows"
      :key="item.slug"
      :to="item.to"
      class="content-row"
    >
      <UIcon :name="KIND_ICON[item.kind]" class="size-5 shrink-0 text-muted" />

      <div class="min-w-0 flex-1">
        <span class="font-medium text-highlighted break-words">{{
          item.name
        }}</span>

        <p class="text-xs text-muted mt-1 [overflow-wrap:anywhere]">
          {{ item.note }}
        </p>
      </div>

      <span class="text-xs text-muted shrink-0 capitalize">{{
        item.kind
      }}</span>

      <UIcon
        name="i-lucide-chevron-right"
        class="size-4 text-dimmed shrink-0"
      />
    </NuxtLink>
  </div>
</template>
