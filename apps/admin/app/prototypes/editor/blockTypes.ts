// Prototype only: Notion-style "Turn into" for an existing top-level block.
import type { Editor } from '@tiptap/vue-3';

type DocNode = NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>;

export type BlockType = 'paragraph' | 'heading2' | 'heading3' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock';

export const BLOCK_TYPES: { type: BlockType; label: string; icon: string }[] = [
  { type: 'paragraph', label: 'Text', icon: 'i-lucide-type' },
  { type: 'heading2', label: 'Heading', icon: 'i-lucide-heading-2' },
  { type: 'heading3', label: 'Subheading', icon: 'i-lucide-heading-3' },
  { type: 'bulletList', label: 'Bulleted list', icon: 'i-lucide-list' },
  { type: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' },
  { type: 'blockquote', label: 'Quote', icon: 'i-lucide-text-quote' },
  { type: 'codeBlock', label: 'Code', icon: 'i-lucide-square-code' }
];

/** The block's current type, or null for blocks without text (images, dividers). */
export function blockTypeOf(node: DocNode): BlockType | null {
  switch (node.type.name) {
    case 'paragraph': return 'paragraph';
    case 'heading': return node.attrs.level === 3 ? 'heading3' : 'heading2';
    case 'bulletList':
    case 'orderedList':
    case 'blockquote':
    case 'codeBlock': return node.type.name;
    default: return null;
  }
}

/** First and last text positions inside the block, so commands apply to all of it. */
function textRange(node: DocNode, pos: number): { from: number; to: number } | null {
  if (node.isTextblock) return { from: pos + 1, to: pos + 1 + node.content.size };

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

  if (type === 'heading2') chain.setHeading({ level: 2 });
  else if (type === 'heading3') chain.setHeading({ level: 3 });
  else if (type === 'bulletList') chain.toggleBulletList();
  else if (type === 'orderedList') chain.toggleOrderedList();
  else if (type === 'blockquote') chain.setBlockquote();
  else if (type === 'codeBlock') chain.setCodeBlock();

  // Leave a caret, not the whole block selected, or the next keystroke replaces it.
  chain.selectTextblockEnd().run();
}

export function duplicateBlock(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);

  if (node) editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
}

export function deleteBlock(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);

  if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
}
