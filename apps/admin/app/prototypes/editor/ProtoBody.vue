<script setup lang="ts">
// Prototype only: the rich-text body without a frame or fixed toolbar.
// Formatting appears on selection; "+" and "/" insert blocks.
import type { DropdownMenuItem, EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';
import type { RichTextDoc } from '@venda/richtext';
import { BLOCK_TYPES, blockTypeOf, deleteBlock, duplicateBlock, turnInto as turnBlockInto } from './blockTypes';

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

// Not named like the template ref: in Vue 3.5 a matching binding captures the ref.
const rootEl = useTemplateRef<HTMLElement>('bodyRoot');

function setHandleMeta(key: 'lockDragHandle' | 'hideDragHandle', value: boolean): void {
  const editor = editorComponent.value?.editor;
  if (editor) editor.view.dispatch(editor.state.tr.setMeta(key, value).setMeta('addToHistory', false));
}

// The "+" and the grip together.
function handleEl(): HTMLElement | null {
  return rootEl.value?.querySelector<HTMLElement>('[data-block-handle]') ?? null;
}

// Block menu (Notion's ⋮⋮): click the grip to change a block's type, duplicate
// or delete it; drag the grip to move the block.
const hoveredPos = shallowRef<number | null>(null);
const menuOpen = shallowRef(false);
const menuItems = shallowRef<DropdownMenuItem[][]>([]);
/** Where the block being acted on sits, relative to the body, for its highlight. */
const targetBox = shallowRef<{ top: number; left: number; width: number; height: number } | null>(null);
const REOPEN_GUARD_MS = 300;
let closedAt = 0;

function buildMenu(editor: Editor, pos: number): DropdownMenuItem[][] {
  const node = editor.state.doc.nodeAt(pos);
  const current = node ? blockTypeOf(node) : null;
  const actions: DropdownMenuItem[] = [
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicateBlock(editor, pos) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteBlock(editor, pos) }
  ];
  if (!current) return [actions];
  const turnInto: DropdownMenuItem[] = [
    { type: 'label', label: 'Turn into' },
    ...BLOCK_TYPES.map(block => ({ type: 'checkbox' as const, label: block.label, icon: block.icon, checked: block.type === current, onSelect: () => turnBlockInto(editor, pos, block.type) }))
  ];
  return [turnInto, actions];
}

function openMenu(editor: Editor): void {
  // A click on the grip while the menu is open first closes it (pointer-down outside); don't reopen.
  if (hoveredPos.value === null || menuOpen.value || performance.now() - closedAt < REOPEN_GUARD_MS) return;
  clearTimeout(idle);
  anchor = null;
  locked = true;
  setHandleMeta('lockDragHandle', true);
  menuItems.value = buildMenu(editor, hoveredPos.value);
  const dom = editor.view.nodeDOM(hoveredPos.value);
  const root = rootEl.value?.getBoundingClientRect();

  if (dom instanceof HTMLElement && root) {
    const box = dom.getBoundingClientRect();
    targetBox.value = { top: box.top - root.top, left: box.left - root.left, width: box.width, height: box.height };
  }

  menuOpen.value = true;
}

function closeMenu(editor: Editor): void {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  closedAt = performance.now();
  targetBox.value = null;
  locked = false;
  setHandleMeta('lockDragHandle', false);
  setHandleMeta('hideDragHandle', true);
  if (!editor.view.hasFocus()) editor.view.focus();
}

const isShown = (el: HTMLElement | null): el is HTMLElement => el !== null && getComputedStyle(el).visibility !== 'hidden';

// Safe triangle (menu-aim): while the pointer travels from the text towards
// the "+", the handle stays on its block instead of jumping to whichever
// block a sagging path crosses. pointermove fires before the mousemove the
// drag handle listens to, so a lock set here applies to that same move.
interface Point { x: number; y: number }
// Widens the 28px handle so a hand's natural wobble (up to ~17px off the line) still counts as aiming.
const TRIANGLE_SLACK_PX = 12;
const HANDLE_SLACK_PX = 4;
const IDLE_UNLOCK_MS = 300;
let anchor: Point | null = null;
let locked = false;
let idle: ReturnType<typeof setTimeout> | undefined;
let pointer: Point = { x: 0, y: 0 };

function setLocked(next: boolean): void {
  if (locked === next) return;
  locked = next;
  setHandleMeta('lockDragHandle', next);
}

function release(): void {
  clearTimeout(idle);
  anchor = null;
  const wasLocked = locked;
  setLocked(false);
  if (!wasLocked) return;
  // The editor ignored the pointer while locked. Catch up: hide the handle if the
  // pointer has left, otherwise let it settle on the block the pointer rests on.
  const box = rootEl.value?.getBoundingClientRect();
  const inside = box && pointer.x >= box.left - 64 && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
  const view = editorComponent.value?.editor?.view.dom;
  if (!inside) setHandleMeta('hideDragHandle', true);
  else view?.dispatchEvent(new MouseEvent('mousemove', { clientX: pointer.x, clientY: pointer.y, bubbles: true }));
}

const side = (p: Point, a: Point, b: Point) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = side(p, a, b);
  const d2 = side(p, b, c);
  const d3 = side(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || menuOpen.value) return;
  pointer = { x: event.clientX, y: event.clientY };
  const handle = handleEl();

  if (!isShown(handle)) {
    anchor = null;
    setLocked(false);
    return;
  }

  const r = handle.getBoundingClientRect();
  const onHandle = pointer.x >= r.left - HANDLE_SLACK_PX && pointer.x <= r.right + HANDLE_SLACK_PX && pointer.y >= r.top - HANDLE_SLACK_PX && pointer.y <= r.bottom + HANDLE_SLACK_PX;

  if (onHandle) {
    // The editor doesn't track the pointer over the handle, so no lock is needed;
    // and a locked handle can't be dragged.
    clearTimeout(idle);
    anchor = null;
    setLocked(false);
    return;
  }

  const top = { x: r.right, y: r.top - TRIANGLE_SLACK_PX };
  const bottom = { x: r.right, y: r.bottom + TRIANGLE_SLACK_PX };

  if (anchor && pointer.x < anchor.x && inTriangle(pointer, anchor, top, bottom)) {
    setLocked(true);
    // Resting inside the triangle means the pointer is not heading anywhere: let the handle follow again.
    clearTimeout(idle);
    idle = setTimeout(release, IDLE_UNLOCK_MS);
    return;
  }

  clearTimeout(idle);
  setLocked(false);
  anchor = pointer;
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointermove', onPointerMoveWhileTyping, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointermove', onPointerMoveWhileTyping);
  clearTimeout(returnTimer);
  clearTimeout(idle);
});

// Typing puts the handle away until the pointer moves deliberately, like the
// rest of the chrome. A CSS state rather than the editor's own hide, because
// the editor re-shows the handle a frame after any mouse move, including
// jitter, and including a move that lands just before the first keystroke.
const JITTER_PX = 4;
const typing = shallowRef(false);
let typingFrom: Point = { x: 0, y: 0 };

function onKeydownCapture(event: KeyboardEvent): void {
  release();
  if (event.metaKey || event.ctrlKey || event.altKey || ['Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
  typing.value = true;
  typingFrom = pointer;
  // Typing again cancels a pending return.
  clearTimeout(returnTimer);
  returnTimer = undefined;
  if (isShown(handleEl())) setHandleMeta('hideDragHandle', true);
}

// After typing, the handle waits a beat once the pointer moves, then snaps
// back with no fade: the first move after writing is rarely aimed at it.
// The beat matches the chrome's 220ms drift back, so they arrive together.
const RETURN_DELAY_MS = 220;
let returnTimer: ReturnType<typeof setTimeout> | undefined;

function onPointerMoveWhileTyping(event: PointerEvent): void {
  if (!typing.value || returnTimer !== undefined) return;
  if (Math.hypot(event.clientX - typingFrom.x, event.clientY - typingFrom.y) <= JITTER_PX) return;
  returnTimer = setTimeout(() => {
    typing.value = false;
    returnTimer = undefined;
  }, RETURN_DELAY_MS);
}

defineExpose({ focusStart });
</script>

<template>
  <div ref="bodyRoot" :class="['proto-body', props.serif && 'proto-body--serif']" :data-typing="typing || undefined" @keydown="onKeydown" @keydown.capture="onKeydownCapture">
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
      <!-- Hovered dozens of times a minute, so it moves between blocks instantly. -->
      <UEditorDragHandle
        v-slot="{ ui, onClick }"
        :editor="editor"
        class="proto-handle"
        :ui="{ root: 'transition-none' }"
        @hover="({ pos }) => (hoveredPos = pos)"
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
            @click="(event: MouseEvent) => { event.stopPropagation(); const selected = onClick(); editorHandlers.suggestion?.execute(editor, { pos: selected?.pos }).run(); }"
          />
          <span class="relative">
            <UButton
              icon="i-lucide-grip-vertical"
              color="neutral"
              variant="ghost"
              active-variant="soft"
              size="sm"
              aria-label="Block options"
              title="Click for options · drag to move"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              :active="menuOpen"
              :class="[ui.handle(), 'cursor-grab active:cursor-grabbing']"
              @click.stop="openMenu(editor)"
            />
            <!-- The menu's anchor; the grip itself stays a plain draggable button.
                 Its click must not reach the drag handle, which would select the whole block. -->
            <UDropdownMenu
              :open="menuOpen"
              :modal="false"
              :items="menuItems"
              :content="{ align: 'start', sideOffset: 6, onCloseAutoFocus: (event: Event) => event.preventDefault() }"
              :ui="{ content: 'w-52' }"
              @update:open="open => { if (!open) closeMenu(editor); }"
            >
              <span aria-hidden="true" class="pointer-events-none absolute inset-0" />
            </UDropdownMenu>
          </span>
        </div>
      </UEditorDragHandle>
    </UEditor>
    <div v-if="targetBox" class="proto-block-target" :style="{ top: `${targetBox.top}px`, left: `${targetBox.left}px`, width: `${targetBox.width}px`, height: `${targetBox.height}px` }" aria-hidden="true" />
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
/* The handle's gutter belongs to the editor, so moving the pointer from the
   text to "+" never leaves the editor (which would hide the handle). Phones
   have no hover and no room for a gutter. */
@media (min-width: 640px) {
  .proto-body :deep(.ProseMirror) {
    width: calc(100% + 4.5rem);
    padding-inline-start: 4.5rem;
    margin-inline-start: -4.5rem;
  }
}

/* Hidden by the editor (typing, or the pointer leaving): fade out rather than
   vanish. Appearing stays instant, because it answers the pointer. */
.proto-body :deep(.proto-handle[style*='visibility: hidden']),
.proto-body[data-typing] :deep(.proto-handle) {
  opacity: 0;
  visibility: hidden;
  transition: opacity 180ms ease, visibility 0s linear 180ms;
}
/* The editor sets pointer-events inline when it shows the handle. */
.proto-body[data-typing] :deep(.proto-handle) { pointer-events: none !important; }

/* Taller invisible hit areas than the 28px icons (not wider: the two sit side by side), plus press feedback. */
.proto-body :deep([data-block-handle] button) {
  position: relative;
  transition: transform 120ms var(--ease-out), background-color 150ms ease, color 150ms ease;
}
.proto-body :deep([data-block-handle] button)::before {
  content: '';
  position: absolute;
  inset: -6px 0;
}
.proto-body :deep([data-block-handle] button:active) { transform: scale(0.94); }
@media (prefers-reduced-motion: reduce) {
  .proto-body :deep([data-block-handle] button:active) { transform: none; }
}

/* The block the open menu acts on. Drawn outside the editor so ProseMirror's DOM is untouched. */
.proto-body { position: relative; isolation: isolate; }
.proto-block-target {
  position: absolute;
  z-index: -1;
  pointer-events: none;
  border-radius: 6px;
  background: color-mix(in oklab, var(--ui-primary) 8%, transparent);
  box-shadow: 0 0 0 6px color-mix(in oklab, var(--ui-primary) 8%, transparent);
}
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
