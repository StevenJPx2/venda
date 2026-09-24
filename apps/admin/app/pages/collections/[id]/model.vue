<script setup lang="ts">
import { FIELD_INTERFACES, SchemaError, fieldLabel, parseSchema, type FieldDefinition } from '@venda/schema';
import type { Collection } from '~/types';

// Directus-style data model editor for one collection.
const route = useRoute();
const toast = useToast();
const { api } = useVendaApi();
const session = useAdminSession();
const collectionId = String(route.params.id);

const collection = shallowRef<Collection | null>(null);
const name = shallowRef('');
const fields = ref<FieldDefinition[]>([]);
const titleKey = shallowRef<string | undefined>(undefined);
const snapshot = shallowRef('');
const loading = shallowRef(true);
const saving = shallowRef(false);
const error = shallowRef('');

const modalOpen = shallowRef(false);
const editing = shallowRef<FieldDefinition | null>(null);
const pendingDelete = shallowRef<string | null>(null);

const draftSchema = computed(() => ({ version: 1 as const, fields: fields.value, ...(titleKey.value ? { titleField: titleKey.value } : {}) }));
const dirty = computed(() => JSON.stringify({ name: name.value, schema: draftSchema.value }) !== snapshot.value);
const titleOptions = computed(() => [
  { label: 'None (use the slug)', value: '' },
  ...fields.value.filter(f => f.interface === 'input' || f.interface === 'textarea').map(f => ({ label: fieldLabel(f), value: f.key }))
]);
const backTo = computed(() => `/?collection=${collectionId}`);

function reset(from: Collection): void {
  collection.value = from;
  name.value = from.name;
  fields.value = from.schema.fields.map(f => ({ ...f }));
  titleKey.value = from.schema.titleField;
  snapshot.value = JSON.stringify({ name: name.value, schema: draftSchema.value });
}

onMounted(async () => {
  if (!(await session.ensure())) return;
  const found = (await api<Collection[]>('/collections')).find(c => c.id === collectionId);
  if (found) reset(found);
  else error.value = 'This collection no longer exists.';
  loading.value = false;
});

function openAdd(): void { editing.value = null; modalOpen.value = true; }
function openEdit(field: FieldDefinition): void { editing.value = field; modalOpen.value = true; }

function saveField(field: FieldDefinition): void {
  const index = fields.value.findIndex(f => f.key === field.key);
  if (index >= 0) fields.value.splice(index, 1, field);
  else fields.value.push(field);
  modalOpen.value = false;
}

function move(index: number, by: -1 | 1): void {
  const target = index + by;
  if (target < 0 || target >= fields.value.length) return;
  const [field] = fields.value.splice(index, 1);
  if (field) fields.value.splice(target, 0, field);
}

function removeField(key: string): void {
  fields.value = fields.value.filter(f => f.key !== key);
  if (titleKey.value === key) titleKey.value = undefined;
  pendingDelete.value = null;
}

async function save(): Promise<void> {
  error.value = '';
  let schema;
  try {
    schema = parseSchema(draftSchema.value);
  } catch (problem) {
    if (problem instanceof SchemaError) { error.value = problem.message; return; }
    throw problem;
  }

  saving.value = true;
  try {
    reset(await api<Collection>(`/collections/${collectionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value, schema }) }));
    toast.add({ title: 'Data model saved', color: 'success', icon: 'i-lucide-circle-check' });
  } catch (problem) {
    error.value = (problem as { data?: { error?: string } }).data?.error ?? 'The data model could not be saved.';
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(() => !dirty.value || window.confirm('Discard unsaved data model changes?'));
</script>

<template>
  <div class="min-h-svh bg-default">
    <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-default bg-default/90 px-4 backdrop-blur">
      <UButton :to="backTo" icon="i-lucide-chevron-left" :label="collection?.name ?? 'Content'" color="neutral" variant="ghost" size="sm" />
      <span class="text-sm text-muted">Data model</span>
      <UButton class="ml-auto" label="Save data model" icon="i-lucide-check" size="sm" :disabled="!dirty" :loading="saving" @click="save" />
    </header>

    <div v-if="loading" class="flex justify-center py-24"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>

    <div v-else-if="collection" class="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

      <UCard>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Collection name">
            <UInput v-model="name" class="w-full" />
          </UFormField>
          <UFormField label="Title field" description="Names each entry and becomes the editor's title.">
            <USelect :model-value="titleKey ?? ''" :items="titleOptions" value-key="value" class="w-full" @update:model-value="titleKey = $event || undefined" />
          </UFormField>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-highlighted">Fields</p>
              <p class="text-sm text-muted">The first rich-text field is the writing canvas; the rest appear as a form.</p>
            </div>
            <UButton label="Add field" icon="i-lucide-plus" size="sm" @click="openAdd" />
          </div>
        </template>

        <UEmpty v-if="!fields.length" icon="i-lucide-shapes" title="No fields yet" description="Add a field to define this collection's content." class="py-12" />

        <ul v-else class="divide-y divide-default">
          <li v-for="(field, index) in fields" :key="field.key" class="flex items-center gap-3 px-4 py-3" :data-field="field.key">
            <div class="flex flex-col">
              <UButton icon="i-lucide-chevron-up" size="xs" color="neutral" variant="ghost" :disabled="index === 0" :aria-label="`Move ${fieldLabel(field)} up`" @click="move(index, -1)" />
              <UButton icon="i-lucide-chevron-down" size="xs" color="neutral" variant="ghost" :disabled="index === fields.length - 1" :aria-label="`Move ${fieldLabel(field)} down`" @click="move(index, 1)" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-highlighted">{{ fieldLabel(field) }}</span>
                <code class="text-xs text-dimmed">{{ field.key }}</code>
                <UBadge :label="FIELD_INTERFACES[field.interface].label" color="neutral" variant="subtle" size="sm" />
                <UBadge v-if="titleKey === field.key" label="Title" color="primary" variant="subtle" size="sm" />
                <UBadge v-if="field.required" label="Required" color="warning" variant="subtle" size="sm" />
                <UBadge v-if="field.width === 'half'" label="Half" color="neutral" variant="outline" size="sm" />
              </div>
              <p v-if="field.note" class="mt-0.5 truncate text-xs text-muted">{{ field.note }}</p>
            </div>
            <template v-if="pendingDelete === field.key">
              <span class="text-xs text-muted">Existing values stay in entries.</span>
              <UButton label="Remove" color="error" size="xs" @click="removeField(field.key)" />
              <UButton label="Keep" color="neutral" variant="ghost" size="xs" @click="pendingDelete = null" />
            </template>
            <template v-else>
              <UButton icon="i-lucide-pencil" size="sm" color="neutral" variant="ghost" :aria-label="`Edit ${fieldLabel(field)}`" @click="openEdit(field)" />
              <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" :aria-label="`Remove ${fieldLabel(field)}`" @click="pendingDelete = field.key" />
            </template>
          </li>
        </ul>
      </UCard>
    </div>

    <div v-else class="flex justify-center py-24">
      <UEmpty icon="i-lucide-file-x" :title="error" :actions="[{ label: 'Back to content', to: backTo, icon: 'i-lucide-arrow-left' }]" />
    </div>

    <VendaFieldModal v-model:open="modalOpen" :field="editing" :existing-keys="fields.map(f => f.key)" @save="saveField" />
  </div>
</template>
