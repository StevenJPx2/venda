<script setup lang="ts">
import type { Collection } from '~/types';

const props = withDefaults(defineProps<{
  collections: Collection[];
  selectedId: string | null;
  collapsed?: boolean;
}>(), { collapsed: false });

const emit = defineEmits<{
  select: [collection: Collection];
  create: [payload: { name: string; slug?: string }];
}>();

const state = reactive({ name: '', slug: '' });
const open = shallowRef(false);
const search = shallowRef('');
const filteredCollections = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return props.collections;
  return props.collections.filter(collection => `${collection.name} ${collection.slug}`.toLowerCase().includes(query));
});

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
  <div class="flex min-h-0 flex-1 flex-col gap-5" :class="collapsed ? 'items-center' : ''">
    <div v-if="!collapsed" class="flex w-full items-center gap-3 px-1 pt-1">
      <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <UIcon name="i-lucide-library-big" class="size-5" aria-hidden="true" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Workspace</p>
        <div class="mt-0.5 flex items-center gap-2">
          <h2 class="truncate text-sm font-semibold text-highlighted">Collections</h2>
          <UBadge color="neutral" variant="subtle" size="xs" :label="String(collections.length)" />
        </div>
      </div>
    </div>

    <UInput
      v-if="!collapsed"
      v-model="search"
      icon="i-lucide-search"
      aria-label="Filter collections"
      placeholder="Find a collection…"
      class="w-full"
    />

    <div class="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden">
      <div v-if="!collapsed" class="flex items-center justify-between px-2">
        <p class="text-xs font-semibold text-muted">YOUR CONTENT</p>
        <span class="text-xs tabular-nums text-dimmed">{{ filteredCollections.length }}</span>
      </div>

      <nav aria-label="Collections" class="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul v-if="filteredCollections.length" class="space-y-1">
          <li v-for="collection in filteredCollections" :key="collection.id">
            <button
              type="button"
              class="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              :class="[
                collapsed ? 'justify-center px-2' : '',
                selectedId === collection.id ? 'bg-primary/10 text-highlighted ring-1 ring-inset ring-primary/20' : 'text-muted hover:bg-elevated hover:text-highlighted'
              ]"
              :aria-current="selectedId === collection.id ? 'page' : undefined"
              :aria-label="collapsed ? collection.name : undefined"
              :title="`${collection.name} · /${collection.slug}`"
              @click="emit('select', collection)"
            >
              <span
                class="grid size-8 shrink-0 place-items-center rounded-md transition-colors"
                :class="selectedId === collection.id ? 'bg-primary text-inverted' : 'bg-elevated text-muted group-hover:text-highlighted'"
              >
                <UIcon :name="selectedId === collection.id ? 'i-lucide-panels-top-left' : 'i-lucide-files'" class="size-4" aria-hidden="true" />
              </span>
              <span v-if="!collapsed" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ collection.name }}</span>
                <span class="mt-0.5 block truncate font-mono text-[11px] text-dimmed">/{{ collection.slug }}</span>
              </span>
              <UIcon v-if="selectedId === collection.id && !collapsed" name="i-lucide-chevron-right" class="size-4 shrink-0 text-primary" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <UEmpty
          v-else-if="collections.length && !collapsed"
          icon="i-lucide-search-x"
          title="No matching collections"
          description="Try a different name or slug."
          class="py-8"
        />
        <UEmpty
          v-else-if="!collapsed"
          icon="i-lucide-folder-plus"
          title="No collections yet"
          description="Create your first collection to start adding content."
          class="py-8"
        />
      </nav>
    </div>

    <div class="w-full space-y-2 border-t border-default pt-4" :class="collapsed ? 'flex justify-center' : ''">
      <UButton v-if="collapsed" icon="i-lucide-plus" color="primary" aria-label="New collection" @click="open = true" />
      <UButton v-else label="New collection" icon="i-lucide-plus" color="primary" block @click="open = true" />
      <p v-if="!collapsed" class="px-1 text-center text-[11px] text-dimmed">Each collection has its own fields and entries.</p>
    </div>

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
