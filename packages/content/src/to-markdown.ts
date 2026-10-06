// A rich-text document to Markdown with block tags, in one canonical style.
import type { RichTextMark, RichTextNode } from '@venda/richtext';
import { Option, Predicate, type Schema } from 'effect';
import type {
  BlockContent,
  DefinitionContent,
  ListItem,
  PhrasingContent,
  TableCell
} from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { mdxJsxToMarkdown, type MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import { toMarkdown, type Options } from 'mdast-util-to-markdown';
import {
  attrsOf,
  BlockAttrs,
  CodeAttrs,
  HeadingAttrs,
  IdentifierAttrs,
  ImageAttrs,
  LinkAttrs,
  OrderedListAttrs,
  TableAttrs,
  TaskAttrs
} from './nodes';

type Flow = BlockContent | DefinitionContent;

// Outermost first when two marks cover the same run.
const MARK_ORDER = [
  'link',
  'bold',
  'italic',
  'strike',
  'superscript',
  'subscript',
  'underline'
];

const MARK_TAGS = new Map([
  ['superscript', 'sup'],
  ['subscript', 'sub'],
  ['underline', 'u']
]);

const sameMark = (a: RichTextMark, b: RichTextMark): boolean =>
  a.type === b.type &&
  JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});

const wrapping = (node: RichTextNode): RichTextMark[] =>
  (node.marks ?? [])
    .filter(mark => MARK_ORDER.includes(mark.type))
    .toSorted(
      (a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type)
    );

function runLength(
  nodes: ReadonlyArray<RichTextNode>,
  from: number,
  mark: RichTextMark
): number {
  let end = from;

  while (
    end < nodes.length &&
    wrapping(nodes[end] ?? { type: 'text' }).some(each => sameMark(each, mark))
  )
    end += 1;

  return end - from;
}

function attributes(
  props: Readonly<Record<string, Schema.Json>> | undefined
): MdxJsxAttribute[] {
  return Object.entries(props ?? {}).map(([name, value]): MdxJsxAttribute => {
    if (value === true) return { type: 'mdxJsxAttribute', name, value: null };
    if (Predicate.isString(value))
      return { type: 'mdxJsxAttribute', name, value };

    return {
      type: 'mdxJsxAttribute',
      name,
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: JSON.stringify(value)
      }
    };
  });
}

function wrap(
  mark: RichTextMark,
  children: PhrasingContent[]
): PhrasingContent[] {
  switch (mark.type) {
    // A link without a usable href keeps its text.
    case 'link':
      return attrsOf(LinkAttrs, mark).pipe(
        Option.match({
          onNone: () => children,
          onSome: ({ href, title }): PhrasingContent[] => [
            { type: 'link', url: href, title: title ?? null, children }
          ]
        })
      );
    case 'bold':
      return [{ type: 'strong', children }];
    case 'italic':
      return [{ type: 'emphasis', children }];
    case 'strike':
      return [{ type: 'delete', children }];
    default:
      return [
        {
          type: 'mdxJsxTextElement',
          name: MARK_TAGS.get(mark.type) ?? mark.type,
          attributes: [],
          children
        }
      ];
  }
}

const LEAVES = new Map<string, (node: RichTextNode) => PhrasingContent[]>([
  [
    'text',
    node => [
      (node.marks ?? []).some(mark => mark.type === 'code')
        ? { type: 'inlineCode', value: node.text ?? '' }
        : { type: 'text', value: node.text ?? '' }
    ]
  ],
  ['hardBreak', () => [{ type: 'break' }]],
  [
    'image',
    node =>
      attrsOf(ImageAttrs, node).pipe(
        Option.match({
          onNone: () => [],
          onSome: ({ src, alt, title }): PhrasingContent[] => [
            { type: 'image', url: src, alt: alt ?? null, title: title ?? null }
          ]
        })
      )
  ],
  [
    'footnoteReference',
    node =>
      attrsOf(IdentifierAttrs, node).pipe(
        Option.match({
          onNone: () => [],
          onSome: ({ identifier }): PhrasingContent[] => [
            { type: 'footnoteReference', identifier, label: identifier }
          ]
        })
      )
  ],

  [
    'inlineBlock',
    node =>
      attrsOf(BlockAttrs, node).pipe(
        Option.match({
          onNone: () => phrasing(node.content ?? []),
          onSome: ({ name, props }): PhrasingContent[] => [
            {
              type: 'mdxJsxTextElement',
              name,
              attributes: attributes(props),
              children: phrasing(node.content ?? [])
            }
          ]
        })
      )
  ]
]);

// Unknown inline nodes keep their content.
const leaf = (node: RichTextNode): PhrasingContent[] =>
  LEAVES.get(node.type)?.(node) ?? phrasing(node.content ?? []);

function phrasing(nodes: ReadonlyArray<RichTextNode>): PhrasingContent[] {
  const out: PhrasingContent[] = [];

  for (let index = 0; index < nodes.length;) {
    const node = nodes[index] ?? { type: 'text' };
    const marks = wrapping(node);
    const [first] = marks;

    if (first === undefined) {
      out.push(...leaf(node));
      index += 1;
      continue;
    }

    const mark = marks.reduce(
      (best, each) =>
        runLength(nodes, index, each) > runLength(nodes, index, best)
          ? each
          : best,
      first
    );
    const length = runLength(nodes, index, mark);
    const inner = nodes.slice(index, index + length).map(each => ({
      ...each,
      marks: (each.marks ?? []).filter(other => !sameMark(other, mark))
    }));

    out.push(...wrap(mark, phrasing(inner)));
    index += length;
  }

  return out;
}

/** A line's content without trailing breaks, which Markdown cannot spell (they show as nothing). */
function line(nodes: ReadonlyArray<RichTextNode>): PhrasingContent[] {
  const end = nodes.findLastIndex(node => node.type !== 'hardBreak');

  return phrasing(nodes.slice(0, end + 1));
}

function listItem(node: RichTextNode): ListItem {
  const checked =
    node.type === 'taskItem'
      ? Option.getOrUndefined(attrsOf(TaskAttrs, node))?.checked === true
      : null;

  return {
    type: 'listItem',
    spread: false,
    checked,
    children: flow(node.content ?? [])
  };
}

function cell(node: RichTextNode): TableCell {
  const lines = (node.content ?? []).map(paragraph =>
    line(paragraph.content ?? [])
  );

  return {
    type: 'tableCell',
    children: lines.flatMap((each, index) =>
      index ? [{ type: 'break' as const }, ...each] : each
    )
  };
}

const bullets = (node: RichTextNode): Flow[] => [
  {
    type: 'list',
    ordered: false,
    spread: false,
    children: (node.content ?? []).map(listItem)
  }
];

const BLOCKS = new Map<
  string,
  (node: RichTextNode, content: ReadonlyArray<RichTextNode>) => Flow[]
>([
  [
    'paragraph',
    (_node, content) => [{ type: 'paragraph', children: line(content) }]
  ],
  [
    'heading',
    (node, content) => [
      {
        type: 'heading',
        depth: Option.getOrUndefined(attrsOf(HeadingAttrs, node))?.level ?? 1,
        children: line(content)
      }
    ]
  ],
  [
    'codeBlock',
    (node, content) => [
      {
        type: 'code',
        lang: Option.getOrUndefined(attrsOf(CodeAttrs, node))?.language ?? null,
        value: content.map(each => each.text ?? '').join('')
      }
    ]
  ],
  ['horizontalRule', () => [{ type: 'thematicBreak' }]],
  ['image', node => [{ type: 'paragraph', children: leaf(node) }]],
  [
    'blockquote',
    (_node, content) => [{ type: 'blockquote', children: flow(content) }]
  ],
  ['bulletList', bullets],
  ['taskList', bullets],
  [
    'orderedList',
    (node, content) => [
      {
        type: 'list',
        ordered: true,
        start:
          Option.getOrUndefined(attrsOf(OrderedListAttrs, node))?.start ?? 1,
        spread: false,
        children: content.map(listItem)
      }
    ]
  ],
  [
    'table',
    (node, content) => [
      {
        type: 'table',
        align: [
          ...(Option.getOrUndefined(attrsOf(TableAttrs, node))?.align ?? [])
        ],
        children: content.map(row => ({
          type: 'tableRow',
          children: (row.content ?? []).map(cell)
        }))
      }
    ]
  ],

  [
    'footnoteDefinition',
    (node, content) =>
      attrsOf(IdentifierAttrs, node).pipe(
        Option.match({
          onNone: () => flow(content),
          onSome: ({ identifier }): Flow[] => [
            {
              type: 'footnoteDefinition',
              identifier,
              label: identifier,
              children: flow(content)
            }
          ]
        })
      )
  ],

  [
    'block',
    (node, content) =>
      attrsOf(BlockAttrs, node).pipe(
        Option.match({
          onNone: () => flow(content),
          onSome: ({ name, props }): Flow[] => [
            {
              type: 'mdxJsxFlowElement',
              name,
              attributes: attributes(props),
              children: flow(content)
            }
          ]
        })
      )
  ]
]);

// Unknown blocks keep their content.
const block = (node: RichTextNode): Flow[] =>
  BLOCKS.get(node.type)?.(node, node.content ?? []) ?? flow(node.content ?? []);

const flow = (nodes: ReadonlyArray<RichTextNode>): Flow[] =>
  nodes.flatMap(block);

const options: Options = {
  bullet: '-',
  emphasis: '_',
  strong: '*',
  fence: '`',
  fences: true,
  listItemIndent: 'one',
  rule: '-',
  extensions: [gfmToMarkdown(), mdxJsxToMarkdown()]
};

/** The Markdown for a document. Reading it back gives the same document. */
export function docToMarkdown(doc: {
  readonly content: ReadonlyArray<RichTextNode>;
}): string {
  return toMarkdown({ type: 'root', children: flow(doc.content) }, options);
}
