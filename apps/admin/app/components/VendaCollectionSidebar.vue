<script setup lang="ts">
import type { Collection } from '~/types';

defineProps<{
  collections: Collection[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [collection: Collection];
  create: [payload: { name: string; slug?: string }];
}>();

const state = reactive({ name: '', slug: '' });
const open = shallowRef(false);

function submitCollection(): void {
  const name = state.name.trim();
  const slug = state.slug.trim();

  if (!name) return;

  emit('create', slug ? { name, slug } : { name });
  state.name = '';
  state.slug = '';
  open.value = false;
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="flex items-center justify-between px-1">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-muted">Workspace</p>
        <p class="mt-1 text-sm font-semibold text-highlighted">Collections</p>
      </div>
      <UBadge color="neutral" variant="subtle" :label="collections.length" />
    </div>

    <div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
      <UButton
        v-for="collection in collections"
        :key="collection.id"
        :label="collection.name"
        :variant="selectedId === collection.id ? 'soft' : 'ghost'"
        :color="selectedId === collection.id ? 'primary' : 'neutral'"
        :icon="selectedId === collection.id ? 'i-lucide-panels-top-left' : 'i-lucide-folder'"
        block
        class="justify-start"
        @click="emit('select', collection)"
      />
      <UEmpty
        v-if="!collections.length"
        icon="i-lucide-folder-plus"
        title="No collections yet"
        description="Create your first collection below."
        class="py-8"
      />
    </div>

    <UButton
      label="New collection"
      icon="i-lucide-plus"
      color="primary"
      block
      @click="open = true"
    />

    <UModal v-model:open="open" title="Create a collection" description="Collections define the shape of your content.">
      <template #body>
        <UForm :state="state" class="space-y-4" @submit="submitCollection">
          <UFormField label="Name" name="name" required>
            <UInput v-model="state.name" placeholder="Articles" autofocus />
          </UFormField>
          <UFormField label="Slug" name="slug" description="Optional — generated from the name when empty.">
            <UInput v-model="state.slug" placeholder="articles" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
            <UButton type="submit" label="Create collection" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
