/**
 * Venda's rich-text document: a ProseMirror/TipTap node tree. Node and mark
 * names follow TipTap's StarterKit, plus `superscript` and `image`.
 */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  /** Only on `text` nodes. */
  text?: string;
  marks?: RichTextMark[];
}

export interface RichTextDoc {
  type: 'doc';
  content: RichTextNode[];
}

// Bounds that keep validation and rendering linear and stack-safe.
export const MAX_DEPTH = 48;
export const MAX_NODES = 50_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validMarks(marks: unknown): boolean {
  return marks === undefined || (Array.isArray(marks) && marks.every(mark => isRecord(mark) && typeof mark.type === 'string' && (mark.attrs === undefined || isRecord(mark.attrs))));
}

/** Structural check of an untrusted value; unknown node types are allowed and rendered as their children. */
export function isRichTextDoc(value: unknown): value is RichTextDoc {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content)) return false;
  let count = 0;
  const stack: { node: unknown; depth: number }[] = value.content.map(node => ({ node, depth: 1 }));

  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > MAX_NODES || depth > MAX_DEPTH) return false;
    if (!isRecord(node) || typeof node.type !== 'string' || node.type === 'doc') return false;
    if (node.attrs !== undefined && !isRecord(node.attrs)) return false;
    if (!validMarks(node.marks)) return false;
    if (node.type === 'text' && typeof node.text !== 'string') return false;

    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false;
      for (const child of node.content) stack.push({ node: child, depth: depth + 1 });
    }
  }

  return true;
}

export const emptyDoc = (): RichTextDoc => ({ type: 'doc', content: [] });
