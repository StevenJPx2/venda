<script setup lang="ts">
// Ghost-style post settings: URL metadata and destructive actions.
const props = defineProps<{
  slug: string;
  unmapped: Record<string, unknown>;
  canDelete: boolean;
}>();

const open = defineModel<boolean>('open', { default: false });
const rawSlug = defineModel<string>('rawSlug', { default: '' });

const emit = defineEmits<{
  delete: [];
}>();

const confirmingDelete = shallowRef(false);
const hasUnmapped = computed(() => Object.keys(props.unmapped).length > 0);
</script>

<template>
  <USlideover v-model:open="open" title="Entry settings" description="Set the public URL or manage this entry." side="right" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div class="space-y-6">
        <section class="space-y-3" aria-labelledby="entry-url-heading">
          <div>
            <h2 id="entry-url-heading" class="text-sm font-semibold text-highlighted">Public URL</h2>
            <p class="mt-1 text-xs text-muted">Choose the path readers will use to open this entry.</p>
          </div>
          <UFormField label="Slug" :description="`Preview: /${slug}`">
            <UInput v-model="rawSlug" icon="i-lucide-link" placeholder="post-url" class="w-full" aria-label="URL slug" />
          </UFormField>
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
        <template v-if="canDelete">
          <UButton v-if="!confirmingDelete" label="Delete entry" icon="i-lucide-trash-2" color="error" variant="soft" @click="confirmingDelete = true" />
          <div v-else class="flex items-center gap-2">
            <span class="text-sm text-muted">Delete permanently?</span>
            <UButton label="Delete" color="error" size="sm" @click="emit('delete')" />
            <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="confirmingDelete = false" />
          </div>
        </template>
        <UButton label="Done" color="neutral" variant="outline" class="ml-auto" @click="open = false" />
      </div>
    </template>
  </USlideover>
</template>
