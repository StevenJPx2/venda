<script setup lang="ts">
// Prototype only: the rich-text body without a frame or fixed toolbar.
// Formatting appears on selection; "+" and "/" insert blocks.
import type { EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';
import type { RichTextDoc } from '@venda/richtext';

const props = defineProps<{ serif?: boolean }>();
const body = defineModel<RichTextDoc>({ required: true });
const emit = defineEmits<{ typing: [] }>();

const editorComponent = useTemplateRef<{ editor?: Editor }>('editorRef');
const linkOpen = shallowRef(false);

// No API here: images are inserted from a local object URL.
const handlers = {
  imageUpload: {
    canExecute: () => true,
    execute: (editor: Editor) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) editor.chain().focus().setImage({ src: URL.createObjectURL(file), alt: file.name }).run();
      };
      input.click();
      return editor.chain();
    },
    isActive: () => false
  }
} satisfies EditorCustomHandlers;

const bubbleItems = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': 'Italic' }
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', 'aria-label': 'Heading' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', 'aria-label': 'Quote' }
  ],
  [
    { slot: 'link' as const, icon: 'i-lucide-link' }
  ]
] satisfies EditorToolbarItem<typeof handlers>[][];

const cardItems = [
  [
    { type: 'label', label: 'Text' },
    { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
    { kind: 'heading', level: 2, label: 'Heading', icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, label: 'Subheading', icon: 'i-lucide-heading-3' },
    { kind: 'bulletList', label: 'Bulleted list', icon: 'i-lucide-list' },
    { kind: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' }
  ],
  [
    { type: 'label', label: 'Cards' },
    { kind: 'imageUpload', label: 'Image', icon: 'i-lucide-image' },
    { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
    { kind: 'codeBlock', label: 'Code', icon: 'i-lucide-square-code' },
    { kind: 'horizontalRule', label: 'Divider', icon: 'i-lucide-separator-horizontal' }
  ]
] satisfies EditorSuggestionMenuItem<typeof handlers>[][];

interface BubbleContext {
  editor: { isActive: (name: string) => boolean };
  view: { hasFocus: () => boolean };
  state: { selection: { empty: boolean } };
}
const showBubble = ({ editor, view, state }: BubbleContext) => view.hasFocus() && !state.selection.empty && !editor.isActive('image') && !editor.isActive('codeBlock');

function focusStart(): void {
  const editor = editorComponent.value?.editor;
  if (!editor) return;
  editor.commands.focus('start');
  editor.view.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    const editor = editorComponent.value?.editor;
    if (!editor || editor.state.selection.empty) return;
    event.preventDefault();
    linkOpen.value = true;
    return;
  }
  if (!event.metaKey && !event.ctrlKey) emit('typing');
}

defineExpose({ focusStart });
</script>

<template>
  <div :class="['proto-body', props.serif && 'proto-body--serif']" @keydown="onKeydown">
    <UEditor
      ref="editorRef"
      v-slot="{ editor, handlers: editorHandlers }"
      :model-value="body"
      content-type="json"
      :extensions="vendaEditorExtensions"
      :handlers="handlers"
      :placeholder="{ placeholder: 'Begin writing your post…', mode: 'firstLine' }"
      class="w-full"
      :ui="{ base: 'min-h-[50vh] p-0 sm:px-0' }"
      @update:model-value="value => (body = value as RichTextDoc)"
    >
      <UEditorToolbar :editor="editor" :items="bubbleItems" layout="bubble" :should-show="showBubble">
        <template #link>
          <VendaLinkPopover v-model:open="linkOpen" :editor="editor" />
        </template>
      </UEditorToolbar>
      <UEditorSuggestionMenu :editor="editor" :items="cardItems" />
      <UEditorDragHandle v-slot="{ ui, onClick }" :editor="editor">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Insert a card"
          :class="ui.handle()"
          @click="(event: MouseEvent) => { event.stopPropagation(); const selected = onClick(); editorHandlers.suggestion?.execute(editor, { pos: selected?.pos }).run(); }"
        />
      </UEditorDragHandle>
    </UEditor>
  </div>
</template>

<style scoped>
/* Body copy: 18/1.7, tracking 0; headings tighten as they grow. */
.proto-body :deep(.ProseMirror) {
  font-size: 1.125rem;
  line-height: 1.7;
  letter-spacing: 0;
  color: var(--ui-text);
}
.proto-body :deep(.ProseMirror p) { margin-block: 0 1.1em; }
.proto-body :deep(.ProseMirror h2) {
  font-size: 1.5rem;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin-block: 1.8em 0.5em;
}
.proto-body :deep(.ProseMirror h3) {
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.012em;
  margin-block: 1.5em 0.4em;
}
.proto-body :deep(.ProseMirror blockquote) {
  border-inline-start: 2px solid var(--ui-text-highlighted);
  padding-inline-start: 1.1em;
  font-style: italic;
  color: var(--ui-text-muted);
}

.proto-body--serif :deep(.ProseMirror) {
  font-family: Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria, Georgia, serif;
  font-size: 1.25rem;
  line-height: 1.65;
}
.proto-body--serif :deep(.ProseMirror h2),
.proto-body--serif :deep(.ProseMirror h3) {
  font-family: var(--font-sans);
}
</style>
