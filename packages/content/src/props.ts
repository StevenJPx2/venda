// Attributes on block tags, as data. `<Callout tone="warn" open count={3} />`
// reads as { tone: 'warn', open: true, count: 3 }; expressions must be plain
// data, the same rule as `config.ts`.
import { parseExpressionAt } from 'acorn';
import type { Nodes, Parent } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import { Predicate, Result } from 'effect';
import { literal, type Json, type LiteralProblem } from './literal';

export type Props = Readonly<Record<string, Json>>;

export type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

function expression(
  source: string,
  line: number | undefined
): Result.Result<Json, LiteralProblem> {
  try {
    const node = parseExpressionAt(source, 0, {
      ecmaVersion: 'latest',
      locations: true
    });

    if (source.slice(node.end).trim())
      return Result.fail({
        message: 'Attribute values must be one value',
        line
      });

    return Result.mapError(literal(node), problem => ({
      message: problem.message,
      line
    }));
  } catch {
    return Result.fail({
      message: `Attribute value {${source}} is not valid JavaScript`,
      line
    });
  }
}

function props(element: JsxElement): Result.Result<Props, LiteralProblem> {
  const line = element.position?.start.line;

  return Result.gen(function* () {
    const values: Record<string, Json> = {};

    for (const attribute of element.attributes) {
      if (attribute.type === 'mdxJsxExpressionAttribute')
        return yield* Result.fail({
          message: `<${element.name ?? ''}> cannot spread attributes`,
          line
        });

      const { name, value } = attribute;

      if (value === null || value === undefined) values[name] = true;
      else if (Predicate.isString(value)) values[name] = value;
      else values[name] = yield* expression(value.value, line);
    }

    return values;
  });
}

const isParent = (node: Nodes): node is Nodes & Parent => 'children' in node;

/** Every block tag's attributes, or the first one that is not plain data. */
export function collectProps(
  tree: Nodes
): Result.Result<WeakMap<JsxElement, Props>, LiteralProblem> {
  return Result.gen(function* () {
    const found = new WeakMap<JsxElement, Props>();
    const pending: Nodes[] = [tree];

    for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
      if (
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement'
      ) {
        if (node.name === null)
          return yield* Result.fail({
            message: 'Fragments (<>...</>) are not allowed',
            line: node.position?.start.line
          });

        found.set(node, yield* props(node));
      }

      if (isParent(node)) pending.push(...node.children);
    }

    return found;
  });
}
