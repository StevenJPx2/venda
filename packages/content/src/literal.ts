// Reads a JavaScript expression as data, never running it: strings, numbers,
// booleans, null, arrays and plain objects, and nothing else. Used for
// collection configs and for JSON attributes on block tags.
import type { AnyNode, Expression, Node, Property, SpreadElement } from 'acorn';
import { Predicate, Result, type Schema } from 'effect';

export type Json = typeof Schema.Json.Type;

/** Why an expression is not plain data, and where. */
export interface LiteralProblem {
  readonly message: string;
  readonly line: number | undefined;
}

const problem = (node: Node, message: string): Result.Result<never, LiteralProblem> => Result.fail({ message, line: node.loc?.start.line });

function key(property: Property): Result.Result<string, LiteralProblem> {
  if (property.computed) return problem(property, 'Computed keys are not allowed');
  if (property.key.type === 'Identifier') return Result.succeed(property.key.name);
  if (property.key.type === 'Literal' && Predicate.isString(property.key.value)) return Result.succeed(property.key.value);

  return problem(property, 'Object keys must be names or strings');
}

function object(properties: ReadonlyArray<Property | SpreadElement>): Result.Result<Json, LiteralProblem> {
  return Result.gen(function*() {
    const entries: Array<[string, Json]> = [];

    for (const property of properties) {
      if (property.type === 'SpreadElement') return yield* problem(property, 'Spreads are not allowed');
      if (property.kind !== 'init' || property.method) return yield* problem(property, 'Only plain values are allowed, not methods or accessors');

      entries.push([yield* key(property), yield* literal(property.value)]);
    }

    return Object.fromEntries(entries);
  });
}

function array(elements: ReadonlyArray<Expression | SpreadElement | null>, node: Node): Result.Result<Json, LiteralProblem> {
  return Result.gen(function*() {
    const values: Json[] = [];

    for (const element of elements) {
      if (element === null) return yield* problem(node, 'Arrays cannot have holes');
      if (element.type === 'SpreadElement') return yield* problem(element, 'Spreads are not allowed');

      values.push(yield* literal(element));
    }

    return values;
  });
}

/** The data an expression spells out, or why it is not plain data. */
export function literal(expression: AnyNode): Result.Result<Json, LiteralProblem> {
  switch (expression.type) {
    case 'ObjectExpression': return object(expression.properties);
    case 'ArrayExpression': return array(expression.elements, expression);

    case 'Literal': {
      const { value } = expression;

      if (value === null || Predicate.isString(value) || Predicate.isBoolean(value)) return Result.succeed(value);
      if (Predicate.isNumber(value) && Number.isFinite(value)) return Result.succeed(value);

      return problem(expression, 'Only strings, numbers, booleans and null are allowed');
    }

    case 'UnaryExpression': {
      const { argument } = expression;

      if (expression.operator === '-' && argument.type === 'Literal' && Predicate.isNumber(argument.value)) return Result.succeed(-argument.value);

      return problem(expression, 'Only negative numbers are allowed here');
    }

    case 'TemplateLiteral': {
      if (expression.expressions.length === 0) return Result.succeed(expression.quasis.map(part => part.value.cooked ?? '').join(''));

      return problem(expression, 'Template strings cannot contain expressions');
    }

    default: return problem(expression, `${expression.type} is not plain data; use strings, numbers, booleans, arrays and objects`);
  }
}
