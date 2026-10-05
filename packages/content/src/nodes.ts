// Rich-text nodes carry loosely typed `attrs`; these schemas read each node
// type's attributes, and `richNode` builds nodes without empty properties.
import type { RichTextMark, RichTextNode } from '@venda/richtext';
import { Option, Schema } from 'effect';

const OptionalText = Schema.optional(Schema.NullOr(Schema.String));

export const LinkAttrs = Schema.Struct({ href: Schema.String, title: OptionalText });

export const ImageAttrs = Schema.Struct({ src: Schema.String, alt: OptionalText, title: OptionalText });

export const IdentifierAttrs = Schema.Struct({ identifier: Schema.String });

export const BlockAttrs = Schema.Struct({ name: Schema.String, props: Schema.optional(Schema.Record(Schema.String, Schema.Json)) });

export const HeadingAttrs = Schema.Struct({ level: Schema.Literals([1, 2, 3, 4, 5, 6]) });

export const OrderedListAttrs = Schema.Struct({ start: Schema.optional(Schema.Int) });

export const TaskAttrs = Schema.Struct({ checked: Schema.optional(Schema.Boolean) });

export const CodeAttrs = Schema.Struct({ language: OptionalText });

export const TableAttrs = Schema.Struct({ align: Schema.optional(Schema.Array(Schema.NullOr(Schema.Literals(['left', 'right', 'center'])))) });

/** A node's or mark's attributes read through a schema, if they fit it. */
export function attrsOf<T>(schema: Schema.Decoder<T>, node: RichTextNode | RichTextMark): Option.Option<T> {
  return Schema.decodeUnknownOption(schema)(node.attrs ?? {});
}

/** Handlers for some members of a node union, each given its own member. */
export type Handlers<N extends { readonly type: string }, C, R> = { readonly [K in N['type']]?: (node: Extract<N, { type: K }>, context: C) => R };

/** The handler for a node's type applied to it, if there is one. */
export function dispatch<N extends { readonly type: string }, C, R>(handlers: Handlers<N, C, R>, node: N, context: C): R | undefined {
  // SAFETY: the handler is looked up by `node.type`, so it takes exactly this member of the union.
  const handler = (handlers as Readonly<Record<string, ((node: N, context: C) => R) | undefined>>)[node.type];

  return handler?.(node, context);
}

/** Whether a table has a handler for this node's type. */
export const handles = <N extends { readonly type: string }, C, R>(handlers: Handlers<N, C, R>, node: N): boolean => Object.hasOwn(handlers, node.type);

/** A node with only the properties that have something in them. */
export function richNode(type: string, attrs?: RichTextNode['attrs'], content?: RichTextNode[]): RichTextNode {
  const node: RichTextNode = { type };

  if (attrs !== undefined) node.attrs = attrs;
  if (content?.length) node.content = content;

  return node;
}
