<script setup lang="ts">
import { useAdmin, useAdminResource } from '@venda/admin';
import { isRichTextDoc } from '@venda/richtext';
import { computed, onMounted } from 'vue';
import { entryTitle } from './text';
import DocumentPreview from './DocumentPreview';

const props = defineProps<{ params: Record<string, string> }>();
const admin = useAdmin();

const models = useAdminResource(() => admin.request(admin.api.adminContent.collections()));
const entries = useAdminResource(() => admin.request(admin.api.adminContent.entry({ params: { collection: props.params.collection ?? '', slug: props.params.slug ?? '' } })));
const model = computed(() => models.data.value?.find(item => item.slug === props.params.collection));
const entry = entries.data;
const title = computed(() => entry.value ? entryTitle(entry.value, model.value?.titleField ?? null) : 'Entry');

const body = computed(() => {
  const value = model.value?.bodyField ? entry.value?.data[model.value.bodyField] : undefined;

  return isRichTextDoc(value) ? value : null;
});

const fields = computed(() => Object.entries(entry.value?.data ?? {}).filter(([key]) => key !== model.value?.bodyField && key !== model.value?.titleField));

onMounted(async () => { await Promise.all([models.reload(), entries.reload()]); });
</script>

<template>
  <AdminScreenHeader :title="model?.name ?? 'Content'" description="Read-only preview of the indexed file.">
    <UButton :to="`/content/${props.params.collection}`" label="Back to entries" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
  </AdminScreenHeader>

  <AdminFeedback :busy="entries.busy.value" :error="entries.error.value || models.error.value" :empty="!entries.busy.value && !entry" title="Entry not found" description="It may have been removed, or it is not visible to your role." @retry="entries.reload" />

  <article v-if="entry" class="entry-preview">
    <p class="text-xs text-muted break-all">content/{{ entry.collection }}/{{ entry.slug }}.md</p>
    <h2 class="preview-title">{{ title }}</h2>
    <p class="entry-state mb-8" :data-state="entry.state"><span />{{ entry.state }}</p>
    <DocumentPreview :content="body" />

    <dl v-if="fields.length" class="mt-12 border-t border-default pt-6 space-y-4">
      <div v-for="[key, value] in fields" :key="key">
        <dt class="text-xs text-muted mb-1">{{ key }}</dt>
        <dd class="text-sm break-words">{{ typeof value === 'string' ? value : JSON.stringify(value) }}</dd>
      </div>
    </dl>
  </article>
</template>
