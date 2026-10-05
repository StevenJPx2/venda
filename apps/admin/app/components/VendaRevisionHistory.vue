<script setup lang="ts">
import { toDoc, toPlainText } from '@venda/richtext';
import { fieldLabel, type CollectionSchema, type FieldDefinition } from '@venda/schema';
import type { Entry, Revision } from '~/types';

const props = defineProps<{
  entryId: string;
  schema: CollectionSchema;
  /** The working copy, to compare revisions against. */
  current: Record<string, unknown>;
  canRestore: boolean;
}>();

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ restored: [entry: Entry] }>();

const { api } = useVendaApi();
const session = useAdminSession();
const toast = useToast();

const revisions = shallowRef<Revision[]>([]);
const selected = shallowRef<Revision | null>(null);
const loading = shallowRef(false);
const restoring = shallowRef(false);

const REASONS: Record<Revision['reason'], { label: string; color: 'success' | 'neutral' | 'info' }> = {
  publish: { label: 'Published', color: 'success' },
  save: { label: 'Saved', color: 'neutral' },
  restore: { label: 'Restored', color: 'info' }
};

watch(open, async (isOpen) => {
  if (!isOpen) return;
  loading.value = true;
  try {
    revisions.value = await api<Revision[]>(`/entries/${props.entryId}/revisions`);
    selected.value = revisions.value[0] ?? null;
  } finally {
    loading.value = false;
  }
});

/** A short, readable form of a field value for comparison. */
function display(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'None';
  if (field.interface === 'wysiwyg') return toPlainText(toDoc(value)).slice(0, 400) || 'None';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const changes = computed(() => {
  const revision = selected.value;
  if (!revision) return [];
  return props.schema.fields
    .filter(field => JSON.stringify(revision.data[field.key] ?? null) !== JSON.stringify(props.current[field.key] ?? null))
    .map(field => ({ key: field.key, label: fieldLabel(field), before: display(field, revision.data[field.key]), now: display(field, props.current[field.key]) }));
});

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function restore(): Promise<void> {
  if (!selected.value) return;
  restoring.value = true;
  try {
    emit('restored', await api<Entry>(`/revisions/${selected.value.id}/restore`, { method: 'POST' }));
  } catch {
    toast.add({ title: 'Revision not restored', color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    restoring.value = false;
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="Revision history" description="Snapshots from publishing, restoring and saving (at most every 10 minutes). The newest 50 are kept." side="right" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="loading" class="flex justify-center py-12"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" /></div>
      <UEmpty v-else-if="!revisions.length" icon="i-lucide-history" title="No revisions yet" description="A revision is recorded when you publish, and periodically while you write." />
      <div v-else class="grid gap-4 md:grid-cols-[14rem_1fr]">
        <ul class="space-y-1" aria-label="Revisions">
          <li v-for="revision in revisions" :key="revision.id">
            <button
              type="button"
              class="w-full rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              :class="selected?.id === revision.id ? 'bg-primary/10 ring-1 ring-inset ring-primary/20' : 'hover:bg-elevated'"
              :aria-current="selected?.id === revision.id ? 'true' : undefined"
              @click="selected = revision"
            >
              <span class="flex items-center gap-2">
                <UBadge :color="REASONS[revision.reason].color" variant="subtle" size="xs" :label="REASONS[revision.reason].label" />
                <span v-if="revision.createdBy === session.user.value?.id" class="text-[11px] text-dimmed">by you</span>
              </span>
              <span class="mt-1 block text-xs text-muted">{{ when(revision.createdAt) }}</span>
            </button>
          </li>
        </ul>

        <section v-if="selected" class="min-w-0 space-y-3" aria-live="polite">
          <p class="text-xs text-muted">Compared with the version you are editing.</p>
          <UEmpty v-if="!changes.length" icon="i-lucide-equal" title="Identical to the current version" class="py-8" />
          <div v-for="change in changes" :key="change.key" class="space-y-1.5 rounded-lg border border-default p-3">
            <p class="text-xs font-semibold text-highlighted">{{ change.label }}</p>
            <p class="rounded bg-error/10 px-2 py-1 text-xs text-default"><span class="sr-only">In this revision: </span>{{ change.before }}</p>
            <p class="rounded bg-success/10 px-2 py-1 text-xs text-default"><span class="sr-only">Now: </span>{{ change.now }}</p>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="text-xs text-muted">Restoring replaces what you are editing; publish afterwards to make it live.</p>
        <UButton v-if="canRestore" label="Restore this version" icon="i-lucide-rotate-ccw" :loading="restoring" :disabled="!selected || !changes.length" @click="restore" />
      </div>
    </template>
  </USlideover>
</template>
