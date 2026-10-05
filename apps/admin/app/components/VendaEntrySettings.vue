<script setup lang="ts">
// Ghost-style post settings: URL, scheduling and the trash.
const props = defineProps<{
  slug: string;
  unmapped: Record<string, unknown>;
  canDelete: boolean;
  canSchedule: boolean;
  publishAt: string | null;
  unpublishAt: string | null;
  busy: boolean;
}>();

const open = defineModel<boolean>('open', { default: false });
const rawSlug = defineModel<string>('rawSlug', { default: '' });

const emit = defineEmits<{
  delete: [];
  schedule: [times: { publishAt: string | null; unpublishAt: string | null }];
}>();

const hasUnmapped = computed(() => Object.keys(props.unmapped).length > 0);

// datetime-local works in local time without a zone; the API stores UTC.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);

const times = reactive({ publishAt: '', unpublishAt: '' });
watch([open, () => props.publishAt, () => props.unpublishAt], () => {
  times.publishAt = toLocalInput(props.publishAt);
  times.unpublishAt = toLocalInput(props.unpublishAt);
}, { immediate: true });

const scheduleChanged = computed(() => times.publishAt !== toLocalInput(props.publishAt) || times.unpublishAt !== toLocalInput(props.unpublishAt));
const minimum = computed(() => toLocalInput(new Date().toISOString()));

function saveSchedule(): void {
  emit('schedule', { publishAt: fromLocalInput(times.publishAt), unpublishAt: fromLocalInput(times.unpublishAt) });
}
</script>

<template>
  <USlideover v-model:open="open" title="Entry settings" description="URL, scheduling and removal." side="right" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div class="space-y-8">
        <section class="space-y-3" aria-labelledby="entry-url-heading">
          <div>
            <h2 id="entry-url-heading" class="text-sm font-semibold text-highlighted">Public URL</h2>
            <p class="mt-1 text-xs text-muted">Choose the path readers will use to open this entry.</p>
          </div>
          <UFormField label="Slug" :description="`/${slug}`">
            <UInput v-model="rawSlug" icon="i-lucide-link" placeholder="post-url" class="w-full" aria-label="URL slug" autocomplete="off" spellcheck="false" />
          </UFormField>
        </section>

        <section v-if="canSchedule" class="space-y-3" aria-labelledby="entry-schedule-heading">
          <div>
            <h2 id="entry-schedule-heading" class="text-sm font-semibold text-highlighted">Schedule</h2>
            <p class="mt-1 text-xs text-muted">Publish or take down this entry automatically. Times are in your time zone.</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Publish at" name="publish-at">
              <UInput v-model="times.publishAt" type="datetime-local" :min="minimum" class="w-full" />
            </UFormField>
            <UFormField label="Unpublish at" name="unpublish-at">
              <UInput v-model="times.unpublishAt" type="datetime-local" :min="times.publishAt || minimum" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton v-if="publishAt || unpublishAt" label="Clear schedule" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="emit('schedule', { publishAt: null, unpublishAt: null })" />
            <UButton label="Save schedule" icon="i-lucide-calendar-clock" size="sm" :loading="busy" :disabled="busy || !scheduleChanged" @click="saveSchedule" />
          </div>
        </section>

        <UAlert
          v-if="hasUnmapped"
          color="neutral"
          variant="subtle"
          icon="i-lucide-archive"
          title="Fields outside the data model"
          description="These keys are kept as-is. Add them to the data model to edit them here."
        >
          <template #actions>
            <pre class="max-h-40 w-full overflow-auto rounded bg-elevated p-2 text-xs">{{ JSON.stringify(unmapped, null, 2) }}</pre>
          </template>
        </UAlert>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-between">
        <UButton v-if="canDelete" label="Move to trash" icon="i-lucide-trash-2" color="error" variant="soft" @click="emit('delete')" />
        <UButton label="Done" color="neutral" variant="outline" class="ml-auto" @click="open = false" />
      </div>
    </template>
  </USlideover>
</template>
