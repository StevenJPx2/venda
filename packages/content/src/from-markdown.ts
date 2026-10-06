// Markdown with block tags to a rich-text document.
import type { RichTextDoc, RichTextMark, RichTextNode } from '@venda/richtext';
import { Predicate, Result } from 'effect';
import type {
  Definition,
  List,
  Nodes,
  PhrasingContent,
  RootContent,
  Table
} from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mdxJsxFromMarkdown, type MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import { gfm } from 'micromark-extension-gfm';
import { mdxJsx } from 'micromark-extension-mdx-jsx';
import type { LiteralProblem } from './literal';
import { dispatch, handles, richNode, type Handlers } from './nodes';
import { collectProps, type JsxElement, type Props } from './props';

// Tag names written as marks: `<sup>` is superscript, not a block.
const TAG_MARKS = new Map([
  ['sup', 'superscript'],
  ['sub', 'subscript'],
  ['u', 'underline'],
  ['strong', 'bold'],
  ['b', 'bold'],
  ['em', 'italic'],
  ['i', 'italic'],
  ['s', 'strike'],
  ['del', 'strike']
]);

interface Reading {
  readonly props: WeakMap<JsxElement, Props>;
  readonly definitions: ReadonlyMap<string, Definition>;
}

/** Where inline content goes: the marks it carries and the nodes it joins. */
interface Inline {
  readonly reading: Reading;
  readonly marks: ReadonlyArray<RichTextMark>;
  readonly out: RichTextNode[];
}

function definitions(tree: Nodes): Map<string, Definition> {
  const found = new Map<string, Definition>();
  const pending: Nodes[] = [tree];

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.type === 'definition') found.set(node.identifier, node);
    else if ('children' in node) pending.push(...node.children);
  }

  return found;
}

const withMarks = (
  node: RichTextNode,
  marks: ReadonlyArray<RichTextMark>
): RichTextNode => (marks.length ? { ...node, marks: [...marks] } : node);

function pushText(text: string, { marks, out }: Inline): void {
  if (!text) return;

  const last = out.at(-1);

  if (
    last?.type === 'text' &&
    JSON.stringify(last.marks ?? []) === JSON.stringify(marks)
  )
    last.text = `${last.text ?? ''}${text}`;
  else out.push(withMarks({ type: 'text', text }, marks));
}

function image(
  url: string,
  alt: string | null | undefined,
  title: string | null | undefined
): RichTextNode {
  return {
    type: 'image',
    attrs: { src: url, alt: alt ?? null, title: title ?? null }
  };
}

function inline(nodes: ReadonlyArray<PhrasingContent>, context: Inline): void {
  for (const node of nodes) {
    if (handles(INLINE, node)) dispatch(INLINE, node, context);
    else pushText('value' in node ? node.value : '', context);
  }
}

const marked = (
  children: ReadonlyArray<PhrasingContent>,
  context: Inline,
  mark: RichTextMark
): void => {
  inline(
    children,
    context.marks.some(each => each.type === mark.type && !mark.attrs)
      ? context
      : { ...context, marks: [...context.marks, mark] }
  );
};

const added = (node: RichTextNode, { out }: Inline): void => {
  out.push(node);
};

function inlineElement(node: MdxJsxTextElement, context: Inline): void {
  const mark = TAG_MARKS.get(node.name ?? '');

  if (mark !== undefined) return marked(node.children, context, { type: mark });

  const content: RichTextNode[] = [];

  inline(node.children, { reading: context.reading, marks: [], out: content });
  added(
    withMarks(
      richNode(
        'inlineBlock',
        { name: node.name, props: context.reading.props.get(node) ?? {} },
        content
      ),
      context.marks
    ),
    context
  );
}

const INLINE: Handlers<PhrasingContent, Inline, void> = {
  text: (node, context) =>
    pushText(node.value.replaceAll(/[ \t]*\n[ \t]*/g, ' '), context),
  inlineCode: (node, context) =>
    pushText(node.value, {
      ...context,
      marks: [...context.marks, { type: 'code' }]
    }),
  break: (_node, context) => added({ type: 'hardBreak' }, context),
  strong: (node, context) => marked(node.children, context, { type: 'bold' }),
  emphasis: (node, context) =>
    marked(node.children, context, { type: 'italic' }),
  delete: (node, context) => marked(node.children, context, { type: 'strike' }),
  link: (node, context) =>
    marked(node.children, context, {
      type: 'link',
      attrs: { href: node.url, title: node.title ?? null }
    }),
  image: (node, context) =>
    added(image(node.url, node.alt, node.title), context),
  footnoteReference: (node, context) =>
    added(
      { type: 'footnoteReference', attrs: { identifier: node.identifier } },
      context
    ),
  mdxJsxTextElement: inlineElement,

  linkReference: (node, context) => {
    const definition = context.reading.definitions.get(node.identifier);

    if (definition)
      marked(node.children, context, {
        type: 'link',
        attrs: { href: definition.url, title: definition.title ?? null }
      });
    else inline(node.children, context);
  },

  imageReference: (node, context) => {
    const definition = context.reading.definitions.get(node.identifier);

    if (definition)
      added(image(definition.url, node.alt, definition.title), context);
    else pushText(node.alt ?? '', context);
  }
};

/** A paragraph, with its images lifted out as blocks of their own. */
function paragraph(
  children: ReadonlyArray<PhrasingContent>,
  reading: Reading
): RichTextNode[] {
  const content: RichTextNode[] = [];

  inline(children, { reading, marks: [], out: content });

  const out: RichTextNode[] = [];
  let run: RichTextNode[] = [];

  const flush = () => {
    const trimmed = run.filter(
      (node, index) =>
        node.type !== 'text' ||
        node.text?.trim() ||
        (index > 0 && index < run.length - 1)
    );

    if (trimmed.length) out.push({ type: 'paragraph', content: trimmed });

    run = [];
  };

  for (const node of content) {
    if (node.type !== 'image') run.push(node);
    else {
      flush();
      out.push(node);
    }
  }

  flush();

  return out;
}

function list(node: List, reading: Reading): RichTextNode {
  const tasks = node.children.some(
    item => item.checked !== null && item.checked !== undefined
  );
  const content = node.children.map(item =>
    tasks
      ? richNode(
          'taskItem',
          { checked: item.checked === true },
          blocks(item.children, reading)
        )
      : richNode('listItem', undefined, blocks(item.children, reading))
  );

  if (tasks) return { type: 'taskList', content };

  return node.ordered
    ? { type: 'orderedList', attrs: { start: node.start ?? 1 }, content }
    : { type: 'bulletList', content };
}

function inlineOnly(
  children: ReadonlyArray<PhrasingContent>,
  reading: Reading
): RichTextNode[] {
  const content: RichTextNode[] = [];

  inline(children, { reading, marks: [], out: content });

  return content;
}

function table(node: Table, reading: Reading): RichTextNode {
  const rows = node.children.map((row, index) => ({
    type: 'tableRow',
    content: row.children.map(cell => ({
      type: index === 0 ? 'tableHeader' : 'tableCell',
      content: [
        richNode('paragraph', undefined, inlineOnly(cell.children, reading))
      ]
    }))
  }));

  return { type: 'table', attrs: { align: node.align ?? [] }, content: rows };
}

const BLOCKS: Handlers<RootContent, Reading, RichTextNode[]> = {
  paragraph: (node, reading) => paragraph(node.children, reading),
  heading: (node, reading) => [
    {
      type: 'heading',
      attrs: { level: node.depth },
      content: inlineOnly(node.children, reading)
    }
  ],
  blockquote: (node, reading) => [
    { type: 'blockquote', content: blocks(node.children, reading) }
  ],
  list: (node, reading) => [list(node, reading)],
  code: node => [
    richNode(
      'codeBlock',
      { language: node.lang ?? null },
      node.value ? [{ type: 'text', text: node.value }] : []
    )
  ],
  thematicBreak: () => [{ type: 'horizontalRule' }],
  table: (node, reading) => [table(node, reading)],
  footnoteDefinition: (node, reading) => [
    {
      type: 'footnoteDefinition',
      attrs: { identifier: node.identifier },
      content: blocks(node.children, reading)
    }
  ],
  mdxJsxFlowElement: (node, reading) => [
    richNode(
      'block',
      { name: node.name, props: reading.props.get(node) ?? {} },
      blocks(node.children, reading)
    )
  ],
  definition: () => []
};

const PHRASING = new Set([
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'break',
  'link',
  'linkReference',
  'image',
  'imageReference',
  'footnoteReference',
  'mdxJsxTextElement',
  'html'
]);

const isPhrasing = (node: RootContent): node is PhrasingContent =>
  PHRASING.has(node.type);

// Inline content directly inside a block tag, as in `<Note>Hi</Note>`, runs together into paragraphs.
function blocks(
  nodes: ReadonlyArray<RootContent>,
  reading: Reading
): RichTextNode[] {
  const out: RichTextNode[] = [];
  let phrasing: PhrasingContent[] = [];

  for (const node of nodes) {
    if (isPhrasing(node)) {
      phrasing.push(node);
      continue;
    }

    if (phrasing.length) out.push(...paragraph(phrasing, reading));

    phrasing = [];
    out.push(...(dispatch(BLOCKS, node, reading) ?? []));
  }

  if (phrasing.length) out.push(...paragraph(phrasing, reading));

  return out;
}

const extensions = [
  gfm(),
  mdxJsx(),
  { disable: { null: ['htmlFlow', 'htmlText', 'autolink', 'codeIndented'] } }
];

const mdastExtensions = [gfmFromMarkdown(), mdxJsxFromMarkdown()];

function parse(source: string): Result.Result<Nodes, LiteralProblem> {
  try {
    return Result.succeed(
      fromMarkdown(source, { extensions, mdastExtensions })
    );
  } catch (error) {
    const line =
      Predicate.isObject(error) && Predicate.isNumber(error.line)
        ? error.line
        : undefined;

    return Result.fail({
      message: error instanceof Error ? error.message : String(error),
      line
    });
  }
}

/** The document a Markdown body spells out, or the line it cannot be read at. */
export function markdownToDoc(
  source: string
): Result.Result<RichTextDoc, LiteralProblem> {
  return Result.gen(function* () {
    const tree = yield* parse(source);
    const reading = {
      props: yield* collectProps(tree),
      definitions: definitions(tree)
    };

    return {
      type: 'doc',
      content: 'children' in tree ? blocks(tree.children, reading) : []
    };
  });
}
