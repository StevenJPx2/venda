<script setup lang="ts">
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { entryLink } from '../entries';
import EntryBrowser from '../EntryBrowser.vue';
import { dayText, rowStatus } from '../text';

// Posts and pages: whole-row links in the kind's order, each with its status;
// a dated entry shows its day beside its slug. New entries sit at the top.
const props = defineProps<{ collection: CollectionSummary }>();

const rowsOf = (items: ReadonlyArray<IndexedEntry>) =>
  items.map(entry => {
    const status = rowStatus(entry);

    return {
      ...entryLink(entry, props.collection),
      meta: [dayText(entry.publishedAt), entry.slug]
        .filter(Boolean)
        .join(' · '),
      state: status.state,
      status: status.label
    };
  });
</script>

<template>
  <EntryBrowser
    :collection="collection"
    empty-title="No entries found"
    empty-description="Try another search, or start a new entry."
    :new-label="collection.kind === 'posts' ? 'New post' : 'New page'"
  >
    <template #default="{ items, busy }">
      <div class="list-surface" :aria-busy="busy">
        <NuxtLink
          v-for="row in rowsOf(items)"
          :key="row.slug"
          :to="row.to"
          class="content-row"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted break-words">
              {{ row.title }}
            </p>

            <p class="text-xs text-muted mt-1 break-all tabular-nums">
              {{ row.meta }}
            </p>
          </div>

          <span class="entry-state" :data-state="row.state"
            ><span />{{ row.status }}</span
          >
        </NuxtLink>
      </div>
    </template>
  </EntryBrowser>
</template>
