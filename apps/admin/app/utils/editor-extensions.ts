import { Mark } from '@tiptap/vue-3';

/**
 * `superscript` mark (footnote markers, ordinals). StarterKit has none, and
 * without it the editor would silently drop superscripts from imported content.
 * It must not name other marks in `excludes`: ProseMirror rejects a schema that
 * references a mark it does not contain, and the editor would fail to start.
 */
export const Superscript = Mark.create({
  name: 'superscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: () => ['sup', 0]
});

/** Extensions every Venda rich-text editor adds on top of Nuxt UI's defaults. */
export const vendaEditorExtensions = [Superscript];
