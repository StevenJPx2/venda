<script setup lang="ts">
// The body without a frame or fixed toolbar: formatting appears on a
// selection, "/" and "+" insert blocks, and the grip beside each block moves
// it or opens its menu.
import type { EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';
import { LinkPopover, RichTextEditor } from '@venda/editor-kit';
import type { RichTextDoc } from '@venda/richtext';
import { shallowRef, useTemplateRef } from 'vue';
import { bodyKey } from './keys';
import { useBlockMenu } from './useBlockMenu';
import { useHandleAim } from './useHandleAim';
import { useTypingHandle } from './useTypingHandle';

defineProps<{ modelValue: RichTextDoc | null; readonly: boolean }>();

const emit = defineEmits<{
  'update:modelValue': [doc: RichTextDoc];
  typing: [];
}>();

const richText = useTemplateRef<{ editor: () => Editor | undefined }>(
  'richText'
);
// Not named like the template ref: in Vue 3.5 a matching binding captures the ref.
const rootEl = useTemplateRef<HTMLElement>('bodyRoot');
const linkOpen = shallowRef(false);

const editor = () => richText.value?.editor();
const root = () => rootEl.value;

const aim = useHandleAim({
  editor,
  root,
  menuOpen: () => menu.open.value
});

const menu = useBlockMenu({ root, hold: aim.hold, letGo: aim.letGo });
const handle = useTypingHandle({ editor, root, pointer: aim.pointer });

const bubbleItems = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold' },
    {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      'aria-label': 'Italic'
    }
  ],
  [
    {
      kind: 'heading',
      level: 2,
      icon: 'i-lucide-heading-2',
      'aria-label': 'Heading'
    },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', 'aria-label': 'Quote' }
  ],
  [{ slot: 'link', icon: 'i-lucide-link' }]
] satisfies EditorToolbarItem[][];

const cardItems = [
  [
    { type: 'label', label: 'Text' },
    { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
    { kind: 'heading', level: 2, label: 'Heading', icon: 'i-lucide-heading-2' },
    {
      kind: 'heading',
      level: 3,
      label: 'Subheading',
      icon: 'i-lucide-heading-3'
    },
    { kind: 'bulletList', label: 'Bulleted list', icon: 'i-lucide-list' },
    {
      kind: 'orderedList',
      label: 'Numbered list',
      icon: 'i-lucide-list-ordered'
    }
  ],
  [
    { type: 'label', label: 'Cards' },
    { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
    { kind: 'codeBlock', label: 'Code', icon: 'i-lucide-square-code' },
    {
      kind: 'horizontalRule',
      label: 'Divider',
      icon: 'i-lucide-separator-horizontal'
    }
  ]
] satisfies EditorSuggestionMenuItem[][];

interface BubbleContext {
  readonly editor: {
    readonly isEditable: boolean;
    isActive: (name: string) => boolean;
  };
  readonly view: { hasFocus: () => boolean };
  readonly state: { selection: { empty: boolean } };
}

const showBubble = ({ editor: tiptap, view, state }: BubbleContext) =>
  tiptap.isEditable &&
  view.hasFocus() &&
  !state.selection.empty &&
  !tiptap.isActive('codeBlock');

function focusStart(): void {
  const tiptap = editor();

  if (!tiptap) return;

  tiptap.commands.focus('start');
  tiptap.view.focus();
}

// Linking needs text selected in an editable body.
const canLink = () => {
  const tiptap = editor();

  return Boolean(tiptap?.isEditable) && !tiptap?.state.selection.empty;
};

function onKeydown(event: KeyboardEvent): void {
  const meaning = bodyKey(event);

  if (meaning === 'typing') emit('typing');

  if (meaning !== 'link' || !canLink()) return;

  event.preventDefault();
  linkOpen.value = true;
}

function onKeydownCapture(event: KeyboardEvent): void {
  aim.release();
  handle.onKey(event);
}

defineExpose({ focusStart });
</script>

<template>
  <div
    ref="bodyRoot"
    class="writer-body"
    :data-typing="handle.typing.value || undefined"
    @keydown="onKeydown"
    @keydown.capture="onKeydownCapture"
  >
    <RichTextEditor
      ref="richText"
      v-slot="{ editor: tiptap, handlers }"
      :model-value="modelValue"
      :readonly="readonly"
      placeholder="Begin writing…"
      @update:model-value="doc => emit('update:modelValue', doc)"
    >
      <template v-if="!readonly">
        <UEditorToolbar
          :editor="tiptap"
          :items="bubbleItems"
          layout="bubble"
          :should-show="showBubble"
        >
          <template #link>
            <LinkPopover v-model:open="linkOpen" :editor="tiptap" />
          </template>
        </UEditorToolbar>

        <UEditorSuggestionMenu :editor="tiptap" :items="cardItems" />

        <!-- Hovered dozens of times a minute, so it moves between blocks instantly. -->
        <UEditorDragHandle
          v-slot="{ ui, onClick }"
          :editor="tiptap"
          class="writer-handle"
          :ui="{ root: 'transition-none' }"
          @hover="({ pos }) => (menu.hoveredPos.value = pos)"
        >
          <div data-block-handle class="flex items-center gap-px">
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Insert a card"
              title="Insert a card"
              :class="ui.handle()"
              @click="
                (event: MouseEvent) => {
                  event.stopPropagation();
                  if (!tiptap.isEditable) return;
                  const selected = onClick();
                  handlers.suggestion
                    ?.execute(tiptap, { pos: selected?.pos })
                    .run();
                }
              "
            />

            <span class="relative">
              <UButton
                icon="i-lucide-grip-vertical"
                color="neutral"
                variant="ghost"
                active-variant="soft"
                size="sm"
                aria-label="Block options"
                title="Click for options, drag to move"
                aria-haspopup="menu"
                :aria-expanded="menu.open.value"
                :active="menu.open.value"
                :class="[ui.handle(), 'cursor-grab active:cursor-grabbing']"
                @click.stop="tiptap.isEditable && menu.show(tiptap)"
              />

              <!-- The menu's anchor; the grip itself stays a plain draggable button.
                   Its click must not reach the drag handle, which would select the whole block. -->
              <UDropdownMenu
                :open="menu.open.value"
                :modal="false"
                :items="menu.items.value"
                :content="{
                  align: 'start',
                  sideOffset: 6,
                  onCloseAutoFocus: (event: Event) => event.preventDefault()
                }"
                :ui="{ content: 'w-52' }"
                @update:open="open => open || menu.close(tiptap)"
              >
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0"
                />
              </UDropdownMenu>
            </span>
          </div>
        </UEditorDragHandle>
      </template>
    </RichTextEditor>

    <div
      v-if="menu.target.value"
      class="writer-block-target"
      :style="{
        top: `${menu.target.value.top}px`,
        left: `${menu.target.value.left}px`,
        width: `${menu.target.value.width}px`,
        height: `${menu.target.value.height}px`
      }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
/* The block the open menu acts on. Drawn outside the editor so ProseMirror's DOM is untouched. */
.writer-body {
  position: relative;
  isolation: isolate;
}
.writer-block-target {
  position: absolute;
  z-index: -1;
  pointer-events: none;
  border-radius: 6px;
  background: color-mix(in oklab, var(--ui-primary) 8%, transparent);
  box-shadow: 0 0 0 6px color-mix(in oklab, var(--ui-primary) 8%, transparent);
}

/* Body copy: 20/1.65 serif, tracking 0; headings tighten as they grow. */
.writer-body :deep(.ProseMirror) {
  min-height: 50vh;
  padding-inline: 0;
  font-family:
    Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria,
    Georgia, serif;
  font-size: 1.25rem;
  line-height: 1.65;
  letter-spacing: 0;
  color: var(--ui-text);
}
.writer-body :deep(.ProseMirror p) {
  margin-block: 0 1.1em;
}
.writer-body :deep(.ProseMirror h2) {
  font-family: var(--font-sans);
  font-size: 1.5rem;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin-block: 1.8em 0.5em;
}
.writer-body :deep(.ProseMirror h3) {
  font-family: var(--font-sans);
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.012em;
  margin-block: 1.5em 0.4em;
}
.writer-body :deep(.ProseMirror blockquote) {
  border-inline-start: 2px solid var(--ui-text-highlighted);
  padding-inline-start: 1.1em;
  font-style: italic;
  color: var(--ui-text-muted);
}

/* The handle's gutter belongs to the editor, so moving the pointer from the
   text to "+" never leaves the editor (which would hide the handle). Phones
   have no hover and no room for a gutter. */
@media (min-width: 640px) {
  .writer-body :deep(.ProseMirror) {
    width: calc(100% + 4.5rem);
    padding-inline: 4.5rem 0;
    margin-inline-start: -4.5rem;
  }
}

/* Hidden by the editor (typing, or the pointer leaving): fade out rather than
   vanish. Appearing stays instant, because it answers the pointer. */
.writer-body :deep(.writer-handle[style*='visibility: hidden']),
.writer-body[data-typing] :deep(.writer-handle) {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 180ms ease,
    visibility 0s linear 180ms;
}
/* The editor sets pointer-events inline when it shows the handle. */
.writer-body[data-typing] :deep(.writer-handle) {
  pointer-events: none !important;
}

/* Taller invisible hit areas than the 28px icons (not wider: the two sit side by side), plus press feedback. */
.writer-body :deep([data-block-handle] button) {
  position: relative;
  transition:
    transform 120ms var(--ease-out),
    background-color 150ms ease,
    color 150ms ease;
}
.writer-body :deep([data-block-handle] button)::before {
  content: '';
  position: absolute;
  inset: -6px 0;
}
.writer-body :deep([data-block-handle] button:active) {
  transform: scale(0.94);
}
@media (prefers-reduced-motion: reduce) {
  .writer-body :deep([data-block-handle] button:active) {
    transform: none;
  }
}
</style>
