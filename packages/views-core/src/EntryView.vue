<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { isRichTextDoc } from '@venda/richtext';
import { computed, onMounted, ref } from 'vue';
import { dateText, entryTitle, fieldText, stateLabel } from './text';
import DocumentPreview from './DocumentPreview';
import EntryDetails from './EntryDetails.vue';

const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();
const collectionSlug = props.params.collection ?? '';

const models = useAdminResource(() => admin.request(admin.api.adminContent.collections()));
const entries = useAdminResource(() => admin.request(admin.api.adminContent.entry({ params: { collection: collectionSlug, slug: props.params.slug ?? '' } })));
const model = computed(() => models.data.value?.find(item => item.slug === collectionSlug));
const entry = entries.data;
const title = computed(() => entry.value ? entryTitle(entry.value, model.value?.titleField ?? null) : 'Entry');

// The way back is named for where it leads. Until the name arrives its space is
// held blank, so the label never visibly changes from a placeholder to the name.
const back = computed(() => ({ to: `/content/${encodeURIComponent(collectionSlug)}`, label: model.value?.name ?? 'Entries', pending: !models.data.value && !models.error.value }));
const failure = computed(() => entries.error.value || models.error.value);
const missing = computed(() => !entries.busy.value && !entry.value);

const body = computed(() => {
  const value = model.value?.bodyField ? entry.value?.data[model.value.bodyField] : undefined;

  return isRichTextDoc(value) ? value : null;
});

// Everything that is not the words: the canvas holds title and body, the panel the rest.
const about = computed(() => entry.value
  ? [['File', `content/${entry.value.collection}/${entry.value.slug}`], ['Publish date', dateText(entry.value.publishedAt)]] as const
  : []);

const fields = computed(() => Object.entries(entry.value?.data ?? {})
  .filter(([key]) => key !== model.value?.bodyField && key !== model.value?.titleField)
  .map(([key, value]) => [key, fieldText(value)] as const));

// Narrow screens open the same panel as a sheet from the right, where its button sits.
const detailsOpen = ref(false);

onMounted(async () => { await Promise.all([models.reload(), entries.reload()]); });
</script>

<template>
  <div class="entry-bar">
    <NuxtLink :to="back.to" class="back-link">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" /><span :class="{ invisible: back.pending }">{{ back.label }}</span>
    </NuxtLink>

    <div v-if="entry" class="flex items-center gap-3">
      <p class="entry-state" :data-state="entry.state"><span />{{ stateLabel(entry.state) }} · read-only</p>
      <UButton class="entry-details-toggle" icon="i-lucide-panel-right" aria-label="Entry details" color="neutral" variant="ghost" @click="detailsOpen = true" />
    </div>
  </div>

  <AdminFeedback :busy="entries.busy.value" :error="failure" :empty="missing" title="Entry not found" description="It may have been removed, or it is not visible to your role." @retry="entries.reload" />

  <div v-if="entry" class="entry-layout">
    <article class="entry-preview">
      <h1 class="preview-title">{{ title }}</h1>
      <DocumentPreview :content="body" />
    </article>

    <aside class="entry-panel" aria-label="Entry details">
      <EntryDetails :about="about" :fields="fields" />
    </aside>
  </div>

  <USlideover v-model:open="detailsOpen" side="right" title="Entry details" description="The file and its frontmatter." :ui="{ content: 'max-w-sm' }">
    <template #body>
      <EntryDetails :about="about" :fields="fields" />
    </template>
  </USlideover>
</template>
