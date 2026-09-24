<script setup lang="ts">
import type { EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';

// Ghost-style distraction-free canvas: a big title, then the rich-text body.
// Formatting appears on selection; blocks are inserted with "+" or "/".
const props = defineProps<{
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  /** Collections without a title field show only the body. */
  hideTitle?: boolean;
}>();

const title = defineModel<string>('title', { default: '' });
const body = defineModel<string>('body', { default: '' });

const { handlers } = useEditorImages();
// The variable must not share the template ref's name: in Vue 3.5 a matching
// setup binding captures the ref instead of useTemplateRef, leaving it empty.
const editorComponent = useTemplateRef<{ editor?: Editor }>('editorRef');
const linkOpen = shallowRef(false);

const words = computed(() => wordCount(body.value));

const bubbleItems = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' }, 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' }, 'aria-label': 'Italic' }
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading' }, 'aria-label': 'Heading' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: 'Subheading' }, 'aria-label': 'Subheading' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: 'Quote' }, 'aria-label': 'Quote' }
  ],
  [
    { slot: 'link' as const, icon: 'i-lucide-link' },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Inline code' }, 'aria-label': 'Inline code' }
  ]
] satisfies EditorToolbarItem<typeof handlers>[][];

const toolbarItems = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' }, 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' }, 'aria-label': 'Italic' }
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading' }, 'aria-label': 'Heading' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: 'Subheading' }, 'aria-label': 'Subheading' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: 'Quote' }, 'aria-label': 'Quote' },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Inline code' }, 'aria-label': 'Inline code' }
  ]
] satisfies EditorToolbarItem<typeof handlers>[][];

const cardItems = [
  [
    { type: 'label', label: 'Text' },
    { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
    { kind: 'heading', level: 2, label: 'Heading', icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, label: 'Subheading', icon: 'i-lucide-heading-3' }
  ],
  [
    { type: 'label', label: 'Lists' },
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

// Only show the formatting bubble for a real text selection, like Ghost. The
// toolbar passes TipTap core's editor, so only the structural bits are typed.
interface BubbleContext {
  editor: { isActive: (name: string) => boolean };
  view: { hasFocus: () => boolean };
  state: { selection: { empty: boolean } };
}

function showBubble({ editor, view, state }: BubbleContext): boolean {
  return view.hasFocus() && !state.selection.empty && !editor.isActive('image') && !editor.isActive('codeBlock');
}

function focusBody(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return;
  const editor = editorComponent.value?.editor;
  if (!editor) return;
  event.preventDefault();
  // TipTap's focus() moves DOM focus a frame later (requestAnimationFrame), so
  // keys typed straight after Enter could still land in the title. Set the
  // selection, then focus synchronously.
  editor.commands.focus('start');
  editor.view.focus();
}

// Cmd/Ctrl+K opens the link popover for the selection (the bubble shows it).
function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    const editor = editorComponent.value?.editor;
    if (!editor || editor.state.selection.empty) return;
    event.preventDefault();
    linkOpen.value = true;
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[760px] px-6 pb-12 pt-10 sm:pt-14" data-testid="writing-canvas">
    <UTextarea
      v-if="!props.hideTitle"
      v-model="title"
      :placeholder="props.titlePlaceholder ?? 'Post title'"
      variant="none"
      :rows="1"
      autoresize
      aria-label="Title"
      class="w-full"
      :ui="{ base: 'p-0 text-4xl font-bold leading-tight tracking-tight text-highlighted placeholder:text-dimmed sm:text-5xl resize-none' }"
      @keydown="focusBody"
    />

    <div class="mt-3 flex items-center justify-between gap-4 border-b border-default/70 pb-3">
      <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Story</span>
      <span class="truncate text-xs text-dimmed">Click to edit · select text to format · type / for blocks</span>
    </div>

    <div class="mt-3 overflow-hidden rounded-xl border border-default bg-default shadow-sm transition-shadow focus-within:shadow-md" @keydown="onKeydown">
      <UEditor
        ref="editorRef"
        v-slot="{ editor, handlers: editorHandlers }"
        v-model="body"
        content-type="html"
        :handlers="handlers"
        :placeholder="{ placeholder: props.bodyPlaceholder ?? 'Begin writing your post…', mode: 'firstLine' }"
        class="venda-canvas w-full"
        :ui="{ base: 'min-h-80 px-5 py-5 text-base leading-8 sm:px-7 sm:py-6' }"
      >
        <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default bg-elevated/40 p-1" />

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

    <p class="fixed bottom-4 right-6 rounded-md bg-default/80 px-2 py-1 text-xs text-muted backdrop-blur">
      {{ words }} {{ words === 1 ? 'word' : 'words' }}
    </p>
  </div>
</template>
