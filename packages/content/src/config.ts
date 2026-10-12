// Reads Venda's settings files as data:
//
//   content/<collection>/config.ts   export default defineCollection({ ... });
//   content/site.ts                  export default defineSite({ ... });
//
// Each is parsed, never executed: anything that is not plain data is rejected
// with its line, so the server can read repository files safely.
import { parse, type AnyNode, type CallExpression, type Program } from 'acorn';
import { Effect, Option, Result, Schema } from 'effect';
import { InvalidConfig } from './errors';
import { literal, type Json } from './literal';
import { decodeModelInput, resolveModel, type CollectionModel } from './model';
import { siteFrom, type SiteSettings } from './site';

type Located<T> = Result.Result<
  T,
  { message: string; line: number | undefined }
>;

const isDefineCall = (
  node: AnyNode | undefined,
  callee: string
): node is CallExpression =>
  node?.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  node.callee.name === callee &&
  node.arguments.length === 1;

function definition(program: Program, callee: string): Located<CallExpression> {
  const others = program.body.filter(
    statement =>
      statement.type !== 'ImportDeclaration' &&
      statement.type !== 'ExportDefaultDeclaration'
  );

  if (others.length)
    return Result.fail({
      message: `Only imports and \`export default ${callee}({ ... })\` are allowed`,
      line: others[0]?.loc?.start.line ?? 1
    });

  const exported = program.body.find(
    statement => statement.type === 'ExportDefaultDeclaration'
  );
  const call = exported?.declaration;

  return isDefineCall(call, callee)
    ? Result.succeed(call)
    : Result.fail({
        message: `The file must \`export default ${callee}({ ... })\` with one object`,
        line: exported?.loc?.start.line ?? 1
      });
}

// acorn's SyntaxError carries the position of the problem.
const decodeAcornLocation = Schema.decodeUnknownOption(
  Schema.Struct({ loc: Schema.Struct({ line: Schema.Number }) })
);

function syntax(source: string): Located<Program> {
  try {
    return Result.succeed(
      parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
      })
    );
  } catch (error) {
    const line = Option.getOrUndefined(
      Option.map(decodeAcornLocation(error), located => located.loc.line)
    );

    return Result.fail({
      message: `Not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`,
      line
    });
  }
}

/** The one object a settings file passes to its define call, as data. */
function definedValue(
  source: string,
  callee: string
): Located<{ value: Json; line: number | undefined }> {
  const program = syntax(source);

  if (Result.isFailure(program)) return Result.fail(program.failure);

  const call = definition(program.success, callee);

  if (Result.isFailure(call)) return Result.fail(call.failure);

  const [argument] = call.success.arguments;
  const line = call.success.loc?.start.line;

  if (argument === undefined || argument.type === 'SpreadElement')
    return Result.fail({ message: `${callee} takes one object`, line });

  return Result.map(literal(argument), value => ({
    value,
    line: argument.loc?.start.line
  }));
}

/** Settings a file defines, checked by `check`, or where and why they are invalid. */
const readDefinition = <T>(
  path: string,
  source: string,
  callee: string,
  check: (value: Json) => Result.Result<T, string>
) =>
  Effect.gen(function* () {
    const defined = definedValue(source, callee);

    if (Result.isFailure(defined))
      return yield* new InvalidConfig({ path, ...defined.failure });

    const checked = check(defined.success.value);

    if (Result.isFailure(checked))
      return yield* new InvalidConfig({
        path,
        message: checked.failure,
        line: defined.success.line
      });

    return checked.success;
  });

/** A model from its JSON form (as the index stores it), checked the same way as a config. */
export function modelFrom(value: Json): Result.Result<CollectionModel, string> {
  return Result.match(decodeModelInput(value), {
    onFailure: error => Result.fail(error.message),
    onSuccess: resolveModel
  });
}

/** The collection model a `config.ts` declares, or where and why it is invalid. */
export const readCollectionConfig = (
  path: string,
  source: string
): Effect.Effect<CollectionModel, InvalidConfig> =>
  readDefinition(path, source, 'defineCollection', modelFrom);

/** The site settings `site.ts` declares, or where and why they are invalid. */
export const readSiteConfig = (
  path: string,
  source: string
): Effect.Effect<SiteSettings, InvalidConfig> =>
  readDefinition(path, source, 'defineSite', siteFrom);
