<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { isRichTextDoc } from '@venda/richtext';
import { computed, onMounted } from 'vue';
import { entryTitle, fieldText, stateLabel } from './text';
import DocumentPreview from './DocumentPreview';

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

const fields = computed(() => Object.entries(entry.value?.data ?? {})
  .filter(([key]) => key !== model.value?.bodyField && key !== model.value?.titleField)
  .map(([key, value]) => [key, fieldText(value)] as const));

onMounted(async () => { await Promise.all([models.reload(), entries.reload()]); });
</script>

<template>
  <div class="entry-bar">
    <NuxtLink :to="back.to" class="back-link">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" /><span :class="{ invisible: back.pending }">{{ back.label }}</span>
    </NuxtLink>

    <p v-if="entry" class="entry-state" :data-state="entry.state"><span />{{ stateLabel(entry.state) }} · read-only</p>
  </div>

  <AdminFeedback :busy="entries.busy.value" :error="failure" :empty="missing" title="Entry not found" description="It may have been removed, or it is not visible to your role." @retry="entries.reload" />

  <article v-if="entry" class="entry-preview">
    <p class="text-xs text-muted break-all">content/{{ entry.collection }}/{{ entry.slug }}</p>
    <h1 class="preview-title">{{ title }}</h1>
    <DocumentPreview :content="body" />

    <dl v-if="fields.length" class="mt-12 border-t border-default pt-6 space-y-4">
      <div v-for="[key, text] in fields" :key="key">
        <dt class="text-xs text-muted mb-1">{{ key }}</dt>
        <dd class="text-sm break-words">{{ text }}</dd>
      </div>
    </dl>
  </article>
</template>
