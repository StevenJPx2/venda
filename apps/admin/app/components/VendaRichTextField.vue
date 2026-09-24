<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui';

// Compact WYSIWYG for rich-text fields inside a form (the writing canvas is
// reserved for a collection's main body field).
defineProps<{ placeholder?: string }>();
const model = defineModel<string>({ default: '' });

const { handlers } = useEditorImages();
const linkOpen = shallowRef(false);

const items = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' }, 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' }, 'aria-label': 'Italic' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bulleted list' }, 'aria-label': 'Bulleted list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' }, 'aria-label': 'Numbered list' }
  ],
  [
    { slot: 'link' as const, icon: 'i-lucide-link' },
    { kind: 'imageUpload', icon: 'i-lucide-image', tooltip: { text: 'Image' }, 'aria-label': 'Image' }
  ]
] satisfies EditorToolbarItem<typeof handlers>[][];
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    v-model="model"
    content-type="html"
    :handlers="handlers"
    :placeholder="placeholder ?? 'Write…'"
    class="w-full overflow-hidden rounded-lg border border-default"
    :ui="{ base: 'min-h-32 px-3 py-2 text-sm' }"
  >
    <UEditorToolbar :editor="editor" :items="items" class="border-b border-default bg-elevated/40 p-1">
      <template #link>
        <VendaLinkPopover v-model:open="linkOpen" :editor="editor" />
      </template>
    </UEditorToolbar>
  </UEditor>
</template>
