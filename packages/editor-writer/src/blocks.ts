// What the block menu does to one top-level block: turn it into another
// type, duplicate it, or delete it.
import type { Editor } from '@tiptap/vue-3';

type DocNode = NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>;

export type BlockType =
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock';

interface BlockChoice {
  readonly type: BlockType;
  readonly label: string;
  readonly icon: string;
}

export const BLOCK_TYPES: ReadonlyArray<BlockChoice> = [
  { type: 'paragraph', label: 'Text', icon: 'i-lucide-type' },
  { type: 'heading2', label: 'Heading', icon: 'i-lucide-heading-2' },
  { type: 'heading3', label: 'Subheading', icon: 'i-lucide-heading-3' },
  { type: 'bulletList', label: 'Bulleted list', icon: 'i-lucide-list' },
  {
    type: 'orderedList',
    label: 'Numbered list',
    icon: 'i-lucide-list-ordered'
  },
  { type: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
  { type: 'codeBlock', label: 'Code', icon: 'i-lucide-square-code' }
];

// Node types that are block types as they are; a heading depends on its level.
const SAME_NAME = new Set<string>([
  'paragraph',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock'
]);

const isBlockType = (name: string): name is BlockType => SAME_NAME.has(name);

// What the menu reads from a block: its type, and a heading's level.
interface NamedNode {
  readonly type: { readonly name: string };
  readonly attrs: { readonly level?: number };
}

/** The block's current type, or null for blocks without text (dividers, kept content). */
export function blockTypeOf(node: NamedNode): BlockType | null {
  if (node.type.name === 'heading')
    return node.attrs.level === 3 ? 'heading3' : 'heading2';

  return isBlockType(node.type.name) ? node.type.name : null;
}

type Chain = ReturnType<Editor['chain']>;

// What turns a cleared block into each type; a paragraph needs nothing more.
const APPLY = {
  paragraph: chain => chain,
  heading2: chain => chain.setHeading({ level: 2 }),
  heading3: chain => chain.setHeading({ level: 3 }),
  bulletList: chain => chain.toggleBulletList(),
  orderedList: chain => chain.toggleOrderedList(),
  blockquote: chain => chain.setBlockquote(),
  codeBlock: chain => chain.setCodeBlock()
} satisfies Record<BlockType, (chain: Chain) => Chain>;

interface TextRange {
  readonly from: number;
  readonly to: number;
}

/** First and last text positions inside the block, so commands apply to all of it. */
function textRange(node: DocNode, pos: number): TextRange | null {
  if (node.isTextblock)
    return { from: pos + 1, to: pos + 1 + node.content.size };

  let from = -1;
  let to = -1;

  node.descendants((child, offset) => {
    if (!child.isTextblock) return true;

    const start = pos + 1 + offset + 1;

    if (from < 0) from = start;

    to = start + child.content.size;

    return false;
  });

  return from < 0 ? null : { from, to };
}

/** Converts the block at `pos`: first back to plain paragraphs, then to the target type. */
export function turnInto(editor: Editor, pos: number, type: BlockType): void {
  const node = editor.state.doc.nodeAt(pos);

  if (!node || blockTypeOf(node) === type) return;

  const range = textRange(node, pos);

  if (!range) return;

  const chain = editor.chain().focus().setTextSelection(range).clearNodes();

  // Leave a caret, not the whole block selected, or the next keystroke replaces it.
  APPLY[type](chain).selectTextblockEnd().run();
}

export function duplicateBlock(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);

  if (node)
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
}

export function deleteBlock(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);

  if (node)
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
}
