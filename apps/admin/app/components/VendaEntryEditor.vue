<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui';
import type { Entry, EntryStatus } from '~/types';

interface EntryDraft {
  slug: string;
  data: string;
  status: EntryStatus;
}

const props = defineProps<{
  entry: Entry | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  submit: [draft: { slug: string; data: Record<string, unknown>; status: EntryStatus }];
  cancel: [];
}>();

const state = reactive<EntryDraft>({ slug: '', data: '{}', status: 'draft' });
const statusOptions = [
  { label: 'Draft', value: 'draft' as const },
  { label: 'Published', value: 'published' as const }
];

watch(() => props.entry, (entry) => {
  state.slug = entry?.slug ?? '';
  state.data = entry ? JSON.stringify(entry.data, null, 2) : '{}';
  state.status = entry?.status ?? 'draft';
}, { immediate: true });

function validate(draft: Partial<EntryDraft>): FormError[] {
  const errors: FormError[] = [];

  if (!draft.slug?.trim()) errors.push({ name: 'slug', message: 'An entry slug is required.' });

  if (!draft.data?.trim()) {
    errors.push({ name: 'data', message: 'Entry data is required.' });
  } else {
    try {
      const parsed: unknown = JSON.parse(draft.data);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) errors.push({ name: 'data', message: 'Data must be a JSON object.' });
    } catch {
      errors.push({ name: 'data', message: 'Data must be valid JSON.' });
    }
  }

  return errors;
}

function submit(event: FormSubmitEvent<EntryDraft>): void {
  emit('submit', { slug: event.data.slug.trim(), data: JSON.parse(event.data.data) as Record<string, unknown>, status: event.data.status });
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-5' }">
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-base font-semibold text-highlighted">{{ entry ? 'Edit entry' : 'New entry' }}</p>
          <p class="mt-1 text-sm text-muted">Store structured content as JSON.</p>
        </div>
        <UBadge v-if="entry" color="neutral" variant="subtle">Editing</UBadge>
      </div>
    </template>

    <UForm :state="state" :validate="validate" class="space-y-5" @submit="submit">
      <div class="grid gap-4 sm:grid-cols-[1fr_180px]">
        <UFormField label="Slug" name="slug" required>
          <UInput v-model="state.slug" icon="i-lucide-link" placeholder="hello-world" />
        </UFormField>
        <UFormField label="Status" name="status" required>
          <USelect v-model="state.status" :items="statusOptions" value-key="value" />
        </UFormField>
      </div>

      <UFormField label="Data" name="data" description="A JSON object containing the entry fields.">
        <UTextarea v-model="state.data" :rows="10" autoresize class="font-mono text-sm" placeholder="{\n  &quot;title&quot;: &quot;Hello&quot;\n}" />
      </UFormField>

      <div class="flex justify-end gap-2">
        <UButton v-if="entry" label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="emit('cancel')" />
        <UButton type="submit" :label="entry ? 'Save changes' : 'Create entry'" icon="i-lucide-check" :loading="saving" />
      </div>
    </UForm>
  </UCard>
</template>
