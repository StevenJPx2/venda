<script setup lang="ts">
import { isRichTextDoc, type RichTextDoc } from '@venda/richtext';
import { bodyField, fieldLabel, previewUrlFor, titleField, type CollectionSchema } from '@venda/schema';
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
const historyOpen = shallowRef(false);
const busy = shallowRef(false);
// A new entry will be owned by the signed-in user.
const owner = computed(() => draft.createdBy.value ?? session.user.value?.id ?? null);
const canPublish = computed(() => session.canOn('publish', owner.value));
// Edits only change the working copy, so editing needs edit rights alone; going live needs publish rights.
watchEffect(() => {
  draft.editable.value = session.canOn('edit', owner.value);
});
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
  get: (): RichTextDoc | null => { const value = bodyDef.value ? draft.data.value[bodyDef.value.key] : null; return isRichTextDoc(value) ? value : null; },
  set: (value: RichTextDoc | null) => { if (bodyDef.value) draft.setField(bodyDef.value.key, value ?? undefined); }
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

const publish = () => run(() => draft.publish(), draft.status.value === 'published' ? 'Changes published' : 'Published');
const unpublish = () => run(() => draft.unpublish(), 'Unpublished');
const schedule = (times: { publishAt?: string | null; unpublishAt?: string | null }) => run(() => draft.schedule(times), times.publishAt === null && times.unpublishAt === null ? 'Schedule cleared' : 'Schedule saved');

/** Opens the site's page for the working copy, or copies the API preview link when no site URL is set. */
async function preview(): Promise<void> {
  const tab = collection.value?.schema.previewUrl ? window.open('', '_blank') : null;

  try {
    const token = await draft.createPreview();
    const template = collection.value?.schema.previewUrl;

    if (template && tab) {
      tab.location.href = previewUrlFor(template, draft.slug.value, token);
      return;
    }

    const apiLink = new URL(`${useRuntimeConfig().public.apiBase}/preview/${encodeURIComponent(token)}`, window.location.origin).toString();
    await navigator.clipboard.writeText(apiLink);
    toast.add({ title: 'Preview link copied', description: 'Set a preview URL in the data model to open previews on your site.', color: 'success', icon: 'i-lucide-link' });
  } catch {
    tab?.close();
    toast.add({ title: 'Preview unavailable', description: draft.errorMessage.value || 'Save the entry and try again.', color: 'error', icon: 'i-lucide-circle-alert' });
  }
}

async function remove(): Promise<void> {
  await draft.remove();
  leaving.value = true;
  toast.add({ title: 'Moved to trash', description: 'Restore it from the collection’s trash within 30 days.', color: 'neutral', icon: 'i-lucide-trash-2' });
  await navigateTo(backTo.value);
}

function restored(): void {
  historyOpen.value = false;
  toast.add({ title: 'Revision restored', ...(draft.status.value === 'published' ? { description: 'Publish to make it live.' } : {}), color: 'success', icon: 'i-lucide-history' });
}

defineShortcuts({
  meta_s: { usingInput: true, handler: () => { void run(() => draft.save(), 'Saved'); } }
});

// Pending edits are saved on the way out; if that fails, confirm before discarding them.
onBeforeRouteLeave(async () => {
  if (leaving.value || !draft.dirty.value || draft.isEmpty.value) return true;

  try {
    await draft.save();
    return true;
  } catch {
    return window.confirm('Your latest changes could not be saved. Leave anyway?');
  }
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
      :has-unpublished-changes="draft.hasUnpublishedChanges.value"
      :publish-at="draft.state.value.publishAt"
      :busy="busy"
      :can-publish="canPublish"
      :editable="draft.editable.value"
      :saved="Boolean(draft.id.value)"
      @publish="publish"
      @unpublish="unpublish"
      @preview="preview"
      @history="historyOpen = true"
      @settings="settingsOpen = true"
    />

    <UAlert
      v-if="draft.state.value.scheduleError"
      color="warning"
      variant="subtle"
      icon="i-lucide-calendar-x"
      title="The scheduled publish did not run"
      :description="draft.state.value.scheduleError"
      class="mx-auto mt-4 max-w-[720px]"
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
      <UEmpty v-if="!formFields.length && !titleDef" icon="i-lucide-shapes" title="This collection has no fields yet" :description="session.can('schema:manage') ? 'Add fields in the data model to start writing.' : 'Ask an administrator to add fields to this collection.'" />
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
      :can-delete="Boolean(draft.id.value) && session.canOn('delete', owner) && (draft.status.value === 'draft' || canPublish)"
      :can-schedule="Boolean(draft.id.value) && canPublish"
      :publish-at="draft.state.value.publishAt"
      :unpublish-at="draft.state.value.unpublishAt"
      :busy="busy"
      @update:raw-slug="draft.setSlug"
      @schedule="schedule"
      @delete="remove"
    />

    <VendaRevisionHistory
      v-if="draft.id.value"
      v-model:open="historyOpen"
      :entry-id="draft.id.value"
      :schema="schema"
      :current="draft.data.value"
      :can-restore="draft.editable.value"
      @restored="entry => { draft.apply(entry); restored(); }"
    />
  </div>
</template>
