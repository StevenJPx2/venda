// An editor drops any node or mark its schema lacks, and saving would then
// lose content from the file. Before a document is edited, whatever the editor
// cannot hold is wrapped whole in a kept node; after editing it is unwrapped,
// unchanged. A document the editor would still alter is reported, so the
// caller opens it read-only instead of saving a changed copy.
import { trimTrailingEmpty } from './text';
import type { RichTextDoc, RichTextMark, RichTextNode } from './types';

export const KEPT_BLOCK = 'vendaKeptBlock';
export const KEPT_INLINE = 'vendaKeptInline';

/** What an editor's schema can hold. */
export interface EditorSchema {
  readonly hasNode: (type: string) => boolean;
  readonly hasMark: (type: string) => boolean;
  /** Whether a node of this type holds inline content (a paragraph, a heading). */
  readonly holdsInline: (type: string) => boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fits = (node: RichTextNode, schema: EditorSchema) =>
  schema.hasNode(node.type) &&
  (node.marks ?? []).every(mark => schema.hasMark(mark.type));

function keepNodes(
  nodes: ReadonlyArray<RichTextNode>,
  parent: string,
  schema: EditorSchema
): RichTextNode[] {
  const kept = schema.holdsInline(parent) ? KEPT_INLINE : KEPT_BLOCK;

  return nodes.map(node =>
    fits(node, schema)
      ? withContent(node, keepNodes(node.content ?? [], node.type, schema))
      : { type: kept, attrs: { node } }
  );
}

const withContent = (node: RichTextNode, content: RichTextNode[]) =>
  node.content === undefined ? node : { ...node, content };

/** The document with every node the editor cannot hold wrapped in a kept node. */
export const keepUnknown = (
  doc: RichTextDoc,
  schema: EditorSchema
): RichTextDoc => ({
  type: 'doc',
  content: keepNodes(doc.content, 'doc', schema)
});

const keptNode = (node: RichTextNode): RichTextNode | undefined => {
  const inner = node.attrs?.node;

  return isRecord(inner) && typeof inner.type === 'string'
    ? (inner as unknown as RichTextNode)
    : undefined;
};

function restoreNodes(nodes: ReadonlyArray<RichTextNode>): RichTextNode[] {
  return nodes.map(node => {
    if (node.type === KEPT_BLOCK || node.type === KEPT_INLINE)
      return keptNode(node) ?? node;

    return withContent(node, restoreNodes(node.content ?? []));
  });
}

/**
 * The edited document with every kept node unwrapped as it was. The empty
 * paragraphs an editor keeps at the end for the cursor are dropped: Markdown
 * has no such paragraph, so the file never held one.
 */
export const restoreKept = (doc: RichTextDoc): RichTextDoc =>
  trimTrailingEmpty({ type: 'doc', content: restoreNodes(doc.content) });

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Every attribute the original sets is still set to the same value. */
const keepsAttrs = (
  original: Record<string, unknown> | undefined,
  edited: Record<string, unknown> | undefined
) =>
  Object.entries(original ?? {}).every(
    ([key, value]) =>
      value === null || value === undefined || sameJson(value, edited?.[key])
  );

const keepsMarks = (
  original: ReadonlyArray<RichTextMark>,
  edited: ReadonlyArray<RichTextMark>
) =>
  original.length === edited.length &&
  original.every(mark =>
    edited.some(
      each => each.type === mark.type && keepsAttrs(mark.attrs, each.attrs)
    )
  );

const markKey = (node: RichTextNode) =>
  JSON.stringify(
    [...(node.marks ?? [])].sort((a, b) => a.type.localeCompare(b.type))
  );

/** Adjacent text with the same marks reads as one run; empty text is nothing. */
function runs(nodes: ReadonlyArray<RichTextNode>): RichTextNode[] {
  const out: RichTextNode[] = [];

  for (const node of nodes) {
    const last = out.at(-1);

    if (node.type === 'text' && !node.text) continue;

    if (
      last?.type === 'text' &&
      node.type === 'text' &&
      markKey(last) === markKey(node)
    )
      out[out.length - 1] = {
        ...last,
        text: `${last.text ?? ''}${node.text ?? ''}`
      };
    else out.push(node);
  }

  return out;
}

function keepsNode(original: RichTextNode, edited: RichTextNode): boolean {
  if (original.type !== edited.type || original.text !== edited.text)
    return false;

  if (!keepsAttrs(original.attrs, edited.attrs)) return false;
  if (!keepsMarks(original.marks ?? [], edited.marks ?? [])) return false;

  return keepsNodes(original.content ?? [], edited.content ?? []);
}

function keepsNodes(
  original: ReadonlyArray<RichTextNode>,
  edited: ReadonlyArray<RichTextNode>
): boolean {
  const a = runs(original);
  const b = runs(edited);

  return (
    a.length === b.length &&
    a.every((node, index) => {
      const other = b[index];

      return other !== undefined && keepsNode(node, other);
    })
  );
}

/**
 * Whether the editor holds the document unchanged: every node, text, mark and
 * attribute of the original survives. Attributes the editor adds are ignored.
 */
export const keepsDocument = (original: RichTextDoc, edited: RichTextDoc) =>
  keepsNodes(original.content, edited.content);
