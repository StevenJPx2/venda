<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3';

// Ghost-style link editing for the current selection: paste a URL, Enter to
// apply, or remove an existing link.
const props = defineProps<{ editor: Editor }>();
const open = defineModel<boolean>('open', { default: false });

const url = shallowRef('');
const active = computed(() => props.editor.isActive('link'));

watch(open, (isOpen) => {
  if (isOpen) url.value = String(props.editor.getAttributes('link').href ?? '');
});

function normalise(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function apply(): void {
  const href = normalise(url.value);
  const chain = props.editor.chain().focus().extendMarkRange('link');
  if (href) chain.setLink({ href }).run();
  else chain.unsetLink().run();
  open.value = false;
}

function remove(): void {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run();
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'bottom', align: 'start' }">
    <UButton
      icon="i-lucide-link"
      color="neutral"
      :variant="active ? 'soft' : 'ghost'"
      size="sm"
      aria-label="Link"
      :active="active"
    />

    <template #content>
      <form class="flex w-80 items-center gap-1.5 p-1.5" @submit.prevent="apply">
        <UInput v-model="url" placeholder="Paste or type a link…" autofocus size="sm" class="flex-1" aria-label="Link URL" />
        <UButton type="submit" icon="i-lucide-corner-down-left" size="sm" aria-label="Apply link" />
        <UButton v-if="active" icon="i-lucide-unlink" size="sm" color="neutral" variant="ghost" aria-label="Remove link" @click="remove" />
      </form>
    </template>
  </UPopover>
</template>
