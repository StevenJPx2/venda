<script setup lang="ts">
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { computed } from 'vue';
import { entryLink } from '../entries';
import EntryBrowser from '../EntryBrowser.vue';
import { tableColumns } from '../table';
import { cellText } from '../text';

// Records: a table whose columns are the collection's leading fields; the
// first cell names the entry and opens it.
const props = defineProps<{ collection: CollectionSummary }>();
const table = computed(() => tableColumns(props.collection));

const rowsOf = (items: ReadonlyArray<IndexedEntry>) =>
  items.map(entry => ({
    ...entryLink(entry, props.collection),
    cells: table.value.columns.map(column => cellText(entry.data[column.key]))
  }));
</script>

<template>
  <EntryBrowser
    :collection="collection"
    empty-title="No records found"
    empty-description="Try another search, or add a record."
    new-label="New record"
  >
    <template #default="{ items, busy }">
      <div class="table-surface" :aria-busy="busy">
        <table class="records-table">
          <thead>
            <tr>
              <th scope="col">{{ table.entry }}</th>

              <th v-for="column in table.columns" :key="column.key" scope="col">
                {{ column.label }}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in rowsOf(items)" :key="row.slug">
              <th scope="row">
                <NuxtLink :to="row.to" class="records-link">{{
                  row.title
                }}</NuxtLink>
              </th>

              <td v-for="(value, index) in row.cells" :key="index">
                {{ value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </EntryBrowser>
</template>
