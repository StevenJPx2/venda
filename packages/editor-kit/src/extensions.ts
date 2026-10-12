// What every Venda rich-text editor adds to Nuxt UI's defaults: superscript,
// and the kept nodes that carry anything the editor cannot hold, unchanged
// (@venda/richtext keepUnknown and restoreKept).
import { Mark, Node } from '@tiptap/vue-3';
import { KEPT_BLOCK, KEPT_INLINE } from '@venda/richtext';
import { Option, Schema } from 'effect';

/**
 * `superscript` mark (footnote markers, ordinals). StarterKit has none. It must
 * not name other marks in `excludes`: ProseMirror rejects a schema that
 * references a mark it does not contain, and the editor would fail to start.
 */
const Superscript = Mark.create({
  name: 'superscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: () => ['sup', 0]
});

// The parts of a kept node its label reads: text, a block tag's name, its type.
const decodeKept = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.String,
    text: Schema.optional(Schema.String),
    attrs: Schema.optional(
      Schema.Struct({ name: Schema.optional(Schema.String) })
    )
  })
);

/**
 * What a kept node shows: text as itself (only its formatting is kept, such as
 * a subscript), else the block tag's name, else the node's type.
 */
const keptLabel = (attribute: KeptAttribute) =>
  Option.match(decodeKept(attribute), {
    onNone: () => 'Kept content',
    onSome: kept => kept.text ?? `<${kept.attrs?.name ?? kept.type}>`
  });

// The node attribute ProseMirror stores; decoded above before it is read.
type KeptAttribute = Parameters<typeof decodeKept>[0];

// The kept JSON is an attribute only: never written into the page's HTML, and
// never parsed from pasted HTML, so it cannot be forged by pasting.
const keptAttributes = () => ({
  node: { default: null, rendered: false }
});

const KeptBlock = Node.create({
  name: KEPT_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: keptAttributes,
  parseHTML: () => [],
  renderHTML: ({ node }) => [
    'div',
    { class: 'venda-kept', title: 'Kept exactly as written in the file' },
    keptLabel(node.attrs.node)
  ]
});

const KeptInline = Node.create({
  name: KEPT_INLINE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: keptAttributes,
  parseHTML: () => [],
  renderHTML: ({ node }) => [
    'span',
    {
      class: 'venda-kept venda-kept-inline',
      title: 'Kept exactly as written in the file'
    },
    keptLabel(node.attrs.node)
  ]
});

export const vendaEditorExtensions = [Superscript, KeptBlock, KeptInline];
