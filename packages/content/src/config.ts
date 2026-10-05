// Reads `content/<collection>/config.ts` as data. The file must be
//
//   import { defineCollection } from 'venda';
//   export default defineCollection({ ...a literal... });
//
// It is parsed, never executed: anything that is not plain data is rejected
// with its line, so the server can read repository files safely.
import { parse, type AnyNode, type CallExpression, type Program } from 'acorn';
import { Effect, Option, Result, Schema } from 'effect';
import { InvalidCollectionConfig } from './errors';
import { literal, type Json } from './literal';
import { decodeModelInput, resolveModel, type CollectionModel } from './model';

const isDefineCall = (node: AnyNode | undefined): node is CallExpression => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'defineCollection' && node.arguments.length === 1;

function definition(program: Program): Result.Result<CallExpression, { message: string; line: number | undefined }> {
  const others = program.body.filter(statement => statement.type !== 'ImportDeclaration' && statement.type !== 'ExportDefaultDeclaration');

  if (others.length) return Result.fail({ message: 'Only imports and `export default defineCollection({ ... })` are allowed', line: others[0]?.loc?.start.line ?? 1 });

  const exported = program.body.find(statement => statement.type === 'ExportDefaultDeclaration');
  const call = exported?.declaration;

  return isDefineCall(call) ? Result.succeed(call) : Result.fail({ message: 'The file must `export default defineCollection({ ... })` with one object', line: exported?.loc?.start.line ?? 1 });
}

// acorn's SyntaxError carries the position of the problem.
const decodeAcornLocation = Schema.decodeUnknownOption(Schema.Struct({ loc: Schema.Struct({ line: Schema.Number }) }));

function syntax(source: string): Result.Result<Program, { message: string; line: number | undefined }> {
  try {
    return Result.succeed(parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true }));
  } catch (error) {
    const line = Option.getOrUndefined(Option.map(decodeAcornLocation(error), located => located.loc.line));

    return Result.fail({ message: `Not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`, line });
  }
}

function modelFrom(value: Json): Result.Result<CollectionModel, string> {
  return Result.match(decodeModelInput(value), {
    onFailure: error => Result.fail(error.message),
    onSuccess: resolveModel
  });
}

/** The collection model a `config.ts` declares, or where and why it is invalid. */
export const readCollectionConfig = Effect.fnUntraced(function*(path: string, source: string) {
  const fail = (message: string, line?: number) => new InvalidCollectionConfig({ path, message, line });
  const program = syntax(source);

  if (Result.isFailure(program)) return yield* fail(program.failure.message, program.failure.line);

  const call = definition(program.success);

  if (Result.isFailure(call)) return yield* fail(call.failure.message, call.failure.line);

  const [argument] = call.success.arguments;
  const value = argument === undefined || argument.type === 'SpreadElement' ? Result.fail({ message: 'defineCollection takes one object', line: call.success.loc?.start.line }) : literal(argument);

  if (Result.isFailure(value)) return yield* fail(value.failure.message, value.failure.line);

  const model = modelFrom(value.success);

  if (Result.isFailure(model)) return yield* fail(model.failure, argument?.loc?.start.line);

  return model.success;
});
