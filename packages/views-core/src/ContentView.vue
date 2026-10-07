<script setup lang="ts">
import { useAdmin, useAdminAction, useAdminResource } from '@venda/admin';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { byKind, collectionHeading, KIND_ICON } from './collections';
import { entryTitle, stateLabel } from './text';

const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();

// Long enough to skip a request per keystroke, short enough to feel live.
const SEARCH_PAUSE_MS = 200;

const collectionSlug = props.params.collection ?? '';
const search = ref('');
const loadMore = useAdminAction();
let pending: ReturnType<typeof setTimeout> | undefined;

const collections = useAdminResource(() =>
  admin.request(admin.api.adminContent.collections())
);
const entries = useAdminResource(() =>
  admin.request(
    admin.api.adminContent.entries({
      params: { collection: collectionSlug },
      query: { q: search.value }
    })
  )
);
const collection = computed(() =>
  collections.data.value?.find(item => item.slug === collectionSlug)
);
// The same order and icons as the sidebar. A row says what the collection
// holds in its own words, or where its files are when it has no description.
const ordered = computed(() =>
  byKind(collections.data.value ?? []).map(item => ({
    ...item,
    note: item.description ?? `content/${item.slug}/`
  }))
);

const OVERVIEW = {
  title: 'Content',
  back: undefined,
  description: 'Writing, pages and structured content from your repository.'
};

const heading = computed(() =>
  collectionSlug ? collectionHeading(collection.value) : OVERVIEW
);

// A collection's name is unknown until the models answer; hold its space blank until then.
const titlePending = computed(
  () =>
    Boolean(collectionSlug) &&
    !collections.data.value &&
    !collections.error.value
);

const noCollections = computed(() => collections.data.value?.length === 0);

// A first load shows the loading line; a refresh keeps the old list, dimmed, until the new one lands.
const firstLoad = computed(() => entries.busy.value && !entries.data.value);
const refreshing = computed(
  () => entries.busy.value && Boolean(entries.data.value)
);
const noEntries = computed(
  () => !entries.busy.value && entries.data.value?.items.length === 0
);

const rows = computed(() =>
  (entries.data.value?.items ?? []).map(entry => ({
    slug: entry.slug,
    to: `/content/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.slug)}`,
    title: entryTitle(entry, collection.value?.titleField ?? null),
    state: entry.state,
    status: stateLabel(entry.state)
  }))
);

onMounted(async () => {
  await collections.reload();

  if (collectionSlug) await entries.reload();
});

onUnmounted(() => clearTimeout(pending));

// Clearing answers at once; typing waits for a short pause.
watch(search, value => {
  clearTimeout(pending);
  pending = setTimeout(entries.reload, value ? SEARCH_PAUSE_MS : 0);
});

function searchNow() {
  clearTimeout(pending);
  void entries.reload();
}

async function more() {
  const page = entries.data.value;
  const cursor = page?.nextCursor;

  if (!cursor) return;

  await loadMore.perform(async () => {
    const next = await admin.request(
      admin.api.adminContent.entries({
        params: { collection: collectionSlug },
        query: { cursor, q: search.value }
      })
    );

    // A search that finished meanwhile replaced the list; this page belongs to the old one.
    if (entries.data.value === page)
      entries.data.value = {
        items: [...page.items, ...next.items],
        nextCursor: next.nextCursor
      };
  });
}
</script>

<template>
  <AdminScreenHeader
    :title="heading.title"
    :pending="titlePending"
    :back="heading.back"
    :description="heading.description"
  />

  <AdminFeedback
    :busy="collections.busy.value"
    :error="collections.error.value"
    :empty="noCollections"
    title="No collections yet"
    description="Add a collection folder with config.ts and a Markdown entry."
    @retry="collections.reload"
  />

  <div v-if="!collectionSlug" class="list-surface">
    <NuxtLink
      v-for="item in ordered"
      :key="item.slug"
      :to="`/content/${encodeURIComponent(item.slug)}`"
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

  <template v-else>
    <form class="mb-5 max-w-md" role="search" @submit.prevent="searchNow">
      <UInput
        v-model="search"
        type="search"
        aria-label="Search entries"
        placeholder="Search entries"
        icon="i-lucide-search"
        :loading="refreshing"
        class="w-full"
      >
        <template v-if="search" #trailing>
          <UButton
            icon="i-lucide-x"
            aria-label="Clear search"
            color="neutral"
            variant="link"
            size="sm"
            class="-me-1"
            @click="search = ''"
          />
        </template>
      </UInput>
    </form>

    <AdminFeedback
      :busy="firstLoad"
      :error="entries.error.value"
      :empty="noEntries"
      title="No entries found"
      description="Try another search, or add an entry file to this collection."
      @retry="entries.reload"
    />

    <div class="list-surface" :aria-busy="entries.busy.value">
      <NuxtLink
        v-for="row in rows"
        :key="row.slug"
        :to="row.to"
        class="content-row"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted break-words">
            {{ row.title }}
          </p>

          <p class="text-xs text-muted mt-1 break-all">{{ row.slug }}</p>
        </div>

        <span class="entry-state" :data-state="row.state"
          ><span />{{ row.status }}</span
        >
      </NuxtLink>
    </div>

    <p v-if="loadMore.error.value" role="alert" class="mt-4 text-sm text-error">
      {{ loadMore.error.value }}
    </p>

    <UButton
      v-if="entries.data.value?.nextCursor"
      label="Load more"
      :loading="loadMore.busy.value"
      color="neutral"
      variant="outline"
      class="mt-6"
      @click="more"
    />
  </template>
</template>
