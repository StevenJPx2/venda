import type { RichTextDoc, RichTextNode } from './types';

const BLOCK_SEPARATED = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock'
]);

/** Plain text with blocks separated by newlines. */
export function toPlainText(doc: RichTextDoc): string {
  const parts: string[] = [];

  const walk = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') parts.push(node.text ?? '');
      else if (node.type === 'hardBreak') parts.push('\n');
      else if (node.content) {
        walk(node.content);

        if (BLOCK_SEPARATED.has(node.type)) parts.push('\n');
      }
    }
  };

  walk(doc.content);
  return parts
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function wordCount(doc: RichTextDoc): number {
  const text = toPlainText(doc).trim();
  return text ? text.split(/\s+/).length : 0;
}

function hasMedia(nodes: RichTextNode[]): boolean {
  return nodes.some(
    node =>
      node.type === 'image' ||
      node.type === 'horizontalRule' ||
      (node.content ? hasMedia(node.content) : false)
  );
}

/** True when the document has no text and no images or dividers. */
export function isEmptyDoc(doc: RichTextDoc): boolean {
  return (
    !toPlainText(doc)
      .replace(/\u00a0/g, ' ')
      .trim() && !hasMedia(doc.content)
  );
}

function isEmptyParagraph(node: RichTextNode): boolean {
  return (
    node.type === 'paragraph' &&
    !(node.content ?? []).some(
      child =>
        child.type !== 'hardBreak' &&
        (child.type !== 'text' || (child.text ?? '').trim())
    )
  );
}

/** Drops the empty trailing paragraphs editors keep for the cursor. */
export function trimTrailingEmpty(doc: RichTextDoc): RichTextDoc {
  const content = [...doc.content];
  while (content.length && isEmptyParagraph(content[content.length - 1]!))
    content.pop();
  return { type: 'doc', content };
}
