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

// Not named like the template ref: in Vue 3.5 a matching binding captures the ref.
const rootEl = useTemplateRef<HTMLElement>('bodyRoot');

function setHandleMeta(key: 'lockDragHandle' | 'hideDragHandle', value: boolean): void {
  const editor = editorComponent.value?.editor;
  if (editor) editor.view.dispatch(editor.state.tr.setMeta(key, value).setMeta('addToHistory', false));
}

function handleEl(): HTMLElement | null {
  return rootEl.value?.querySelector<HTMLElement>('[aria-label="Insert a card"]') ?? null;
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
  if (event.pointerType !== 'mouse') return;
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
    clearTimeout(idle);
    anchor = null;
    setLocked(true);
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

onMounted(() => window.addEventListener('pointermove', onPointerMove, { passive: true }));
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  clearTimeout(idle);
});

// Typing puts the "+" away until the pointer moves again, like the rest of the chrome.
function onKeydownCapture(event: KeyboardEvent): void {
  release();
  if (event.metaKey || event.ctrlKey || event.altKey || ['Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
  if (isShown(handleEl())) setHandleMeta('hideDragHandle', true);
}

defineExpose({ focusStart });
</script>

<template>
  <div ref="bodyRoot" :class="['proto-body', props.serif && 'proto-body--serif']" @keydown="onKeydown" @keydown.capture="onKeydownCapture">
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
      <UEditorDragHandle v-slot="{ ui, onClick }" :editor="editor" :ui="{ root: 'transition-none' }">
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
/* The handle's gutter belongs to the editor, so moving the pointer from the
   text to "+" never leaves the editor (which would hide the handle). Phones
   have no hover and no room for a gutter. */
@media (min-width: 640px) {
  .proto-body :deep(.ProseMirror) {
    width: calc(100% + 3.5rem);
    padding-inline-start: 3.5rem;
    margin-inline-start: -3.5rem;
  }
}

/* A larger invisible hit area than the 28px icon, plus press feedback. */
.proto-body :deep([aria-label='Insert a card']) {
  position: relative;
  transition: transform 120ms var(--ease-out), background-color 150ms ease, color 150ms ease;
}
.proto-body :deep([aria-label='Insert a card'])::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.proto-body :deep([aria-label='Insert a card']):active { transform: scale(0.94); }
@media (prefers-reduced-motion: reduce) {
  .proto-body :deep([aria-label='Insert a card']):active { transform: none; }
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
