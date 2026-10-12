<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3';
import {
  emptyDoc,
  isRichTextDoc,
  keepsDocument,
  keepUnknown,
  restoreKept,
  type EditorSchema,
  type RichTextDoc
} from '@venda/richtext';
import { shallowRef, useTemplateRef, watch } from 'vue';
import { vendaEditorExtensions } from './extensions';

// Nuxt UI's editor around a document that must survive editing unchanged.
// Whatever its schema cannot hold is kept whole, and a document it would
// still alter opens read-only rather than being saved changed. The default
// slot receives the editor and its handlers, for menus and toolbars.
const props = defineProps<{
  modelValue: RichTextDoc | null;
  readonly?: boolean;
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [doc: RichTextDoc] }>();

const editorRef = useTemplateRef<{ editor?: Editor }>('editorRef');
const faithful = shallowRef(true);
let loaded = false;
let emitted: RichTextDoc | undefined;

const schemaOf = (editor: Editor): EditorSchema => ({
  hasNode: type => Object.hasOwn(editor.schema.nodes, type),
  hasMark: type => Object.hasOwn(editor.schema.marks, type),
  holdsInline: type =>
    Object.hasOwn(editor.schema.nodes, type) &&
    Boolean(editor.schema.nodes[type]?.inlineContent)
});

function load(editor: Editor) {
  const doc = props.modelValue ?? emptyDoc();

  editor.commands.setContent(keepUnknown(doc, schemaOf(editor)), {
    emitUpdate: false
  });

  const held = editor.getJSON();

  faithful.value = isRichTextDoc(held) && keepsDocument(doc, restoreKept(held));
  editor.setEditable(!props.readonly && faithful.value);
  loaded = true;
}

watch(
  () => editorRef.value?.editor,
  editor => {
    if (editor && !loaded) load(editor);
  },
  { immediate: true }
);

watch(
  () => props.readonly,
  readonly => editorRef.value?.editor?.setEditable(!readonly && faithful.value)
);

// Discard or loading somebody else's version replaces the document. A value
// this editor just emitted is already displayed; loading it resets the caret.
watch(
  () => props.modelValue,
  value => {
    const editor = editorRef.value?.editor;

    if (editor && value !== emitted) load(editor);
  }
);

// The TipTap editor, once it exists, for callers that move the caret.
defineExpose({ editor: () => editorRef.value?.editor });

// Reads the editor's own document rather than the event's value, so the
// update is the checked rich-text document the file will hold.
function onUpdate() {
  const held = editorRef.value?.editor?.getJSON();

  if (loaded && faithful.value && isRichTextDoc(held)) {
    emitted = restoreKept(held);
    emit('update:modelValue', emitted);
  }
}
</script>

<template>
  <UEditor
    ref="editorRef"
    v-slot="slotProps"
    content-type="json"
    :image="false"
    :extensions="vendaEditorExtensions"
    :placeholder="{ placeholder: placeholder ?? '', mode: 'firstLine' }"
    class="w-full"
    @update:model-value="onUpdate"
  >
    <slot v-bind="slotProps" />
  </UEditor>

  <p v-if="!faithful" class="mt-2 text-xs text-muted">
    This text has formatting the editor cannot keep exactly, so it is shown
    read-only. Edit the file to change it.
  </p>
</template>
