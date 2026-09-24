<script setup lang="ts">
import { bodyField, fieldLabel, titleField, type CollectionSchema } from '@venda/schema';
import type { Collection } from '~/types';

// Keyed by collection so the page survives the /new → /<id> URL swap after
// the first autosave instead of remounting mid-sentence.
definePageMeta({ key: route => `editor-${String(route.params.collection)}` });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { api } = useVendaApi();
const session = useAdminSession();

const collectionId = String(route.params.collection);
const isNew = String(route.params.entry) === 'new';

const collection = shallowRef<Collection | null>(null);
const schema = computed<CollectionSchema>(() => collection.value?.schema ?? { version: 1, fields: [] });
const draft = useEntryDraft(collectionId, schema);

const loading = shallowRef(true);
const loadError = shallowRef('');
const settingsOpen = shallowRef(false);
const busy = shallowRef(false);
const leaving = shallowRef(false);

const titleDef = computed(() => titleField(schema.value));
const bodyDef = computed(() => bodyField(schema.value));
const formFields = computed(() => schema.value.fields.filter(f => f.key !== titleDef.value?.key && f.key !== bodyDef.value?.key));
const unmapped = computed(() => Object.fromEntries(Object.entries(draft.data.value).filter(([key]) => !schema.value.fields.some(f => f.key === key))));
const backTo = computed(() => `/?collection=${collectionId}`);
const canvasProps = computed(() => ({
  hideTitle: !titleDef.value,
  ...(titleDef.value ? { titlePlaceholder: fieldLabel(titleDef.value) } : {}),
  ...(bodyDef.value?.placeholder ? { bodyPlaceholder: bodyDef.value.placeholder } : {})
}));

const titleModel = computed({
  get: () => draft.title.value,
  set: (value: string) => { if (titleDef.value) draft.setField(titleDef.value.key, value); }
});
const bodyModel = computed({
  get: () => { const value = bodyDef.value ? draft.data.value[bodyDef.value.key] : ''; return typeof value === 'string' ? value : ''; },
  set: (value: string) => { if (bodyDef.value) draft.setField(bodyDef.value.key, value); }
});

onMounted(async () => {
  if (!(await session.ensure())) return;
  try {
    collection.value = (await api<Collection[]>('/collections')).find(c => c.id === collectionId) ?? null;
    if (!collection.value) loadError.value = 'This collection no longer exists.';
    else if (isNew) draft.begin();
    else await draft.load(String(route.params.entry));
  } catch {
    loadError.value = 'This entry could not be loaded.';
  } finally {
    loading.value = false;
  }
});

// Give a new entry its permanent URL once it has been saved.
watch(draft.id, (id) => { if (id && isNew) void router.replace(`/editor/${collectionId}/${id}`); });

async function run(action: () => Promise<void>, success: string): Promise<void> {
  busy.value = true;
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    toast.add({ title: 'Not saved', description: draft.errorMessage.value, color: 'error', icon: 'i-lucide-circle-alert' });
    const fieldError = draft.fieldErrors.value.find(error => formFields.value.some(field => field.key === error.field));
    if (fieldError) {
      await nextTick();
      const container = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldError.field)}"]`);
      container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      container?.querySelector<HTMLElement>('input, textarea, button, [contenteditable="true"], [role="combobox"]')?.focus({ preventScroll: true });
    }
  } finally {
    busy.value = false;
  }
}

const publish = () => run(() => draft.setStatus('published'), 'Published');
const update = () => run(() => draft.save(), 'Updated');
const unpublish = () => run(() => draft.setStatus('draft'), 'Reverted to draft');

async function remove(): Promise<void> {
  await draft.remove();
  leaving.value = true;
  toast.add({ title: 'Entry deleted', color: 'neutral', icon: 'i-lucide-trash-2' });
  await navigateTo(backTo.value);
}

defineShortcuts({
  meta_s: { usingInput: true, handler: () => { void (draft.status.value === 'published' ? update() : run(() => draft.save(), 'Saved')); } }
});

// Drafts are flushed on the way out; published entries ask before discarding.
onBeforeRouteLeave(async () => {
  if (leaving.value || !draft.dirty.value || draft.isEmpty.value) return true;
  if (draft.status.value === 'draft') {
    try { await draft.save(); return true; } catch { /* fall through to confirm */ }
  }
  return window.confirm('You have unsaved changes. Leave without saving?');
});

function warnOnUnload(event: BeforeUnloadEvent): void {
  if (draft.dirty.value && !draft.isEmpty.value) event.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnOnUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload));
</script>

<template>
  <div v-if="loading" class="flex min-h-svh items-center justify-center">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
  </div>

  <div v-else-if="loadError" class="flex min-h-svh items-center justify-center p-6">
    <UEmpty icon="i-lucide-file-x" :title="loadError" :actions="[{ label: 'Back to content', to: backTo, icon: 'i-lucide-arrow-left' }]" />
  </div>

  <div v-else class="min-h-svh bg-default">
    <VendaEditorTopBar
      :collection-name="collection?.name ?? 'Content'"
      :entry-title="draft.title.value"
      :back-to="backTo"
      :status="draft.status.value"
      :save-state="draft.saveState.value"
      :dirty="draft.dirty.value"
      :busy="busy"
      @publish="publish"
      @update="update"
      @unpublish="unpublish"
      @settings="settingsOpen = true"
    />

    <UAlert
      v-if="draft.saveState.value === 'error' && draft.errorMessage.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="draft.errorMessage.value"
      class="mx-auto mt-4 max-w-[720px]"
    />

    <VendaWritingCanvas v-if="bodyDef" v-model:title="titleModel" v-model:body="bodyModel" v-bind="canvasProps" />

    <div v-else class="mx-auto w-full max-w-[760px] space-y-8 px-6 py-12">
      <UTextarea
        v-if="titleDef"
        v-model="titleModel"
        :placeholder="fieldLabel(titleDef)"
        variant="none"
        :rows="1"
        autoresize
        aria-label="Title"
        :ui="{ base: 'p-0 text-4xl font-bold tracking-tight text-highlighted placeholder:text-dimmed resize-none' }"
      />
      <UEmpty v-if="!formFields.length && !titleDef" icon="i-lucide-shapes" title="This collection has no fields yet" description="Add fields in the data model to start writing." />
    </div>

    <section v-if="formFields.length" class="mx-auto w-full max-w-[760px] space-y-5 px-6 pb-16" aria-labelledby="entry-fields-heading" data-testid="entry-fields">
      <div class="flex items-start justify-between gap-4 border-b border-default pb-3">
        <div>
          <h2 id="entry-fields-heading" class="text-sm font-semibold text-highlighted">Fields</h2>
          <p class="mt-1 text-xs text-muted">Structured details for this entry.</p>
        </div>
        <UBadge color="neutral" variant="subtle" :label="String(formFields.length)" />
      </div>
      <VendaFieldForm :fields="formFields" :data="draft.data.value" :errors="draft.fieldErrors.value" @change="draft.setField" />
    </section>

    <VendaEntrySettings
      v-model:open="settingsOpen"
      :raw-slug="draft.rawSlug.value"
      :slug="draft.slug.value"
      :unmapped="unmapped"
      :can-delete="Boolean(draft.id.value)"
      @update:raw-slug="draft.setSlug"
      @delete="remove"
    />
  </div>
</template>
