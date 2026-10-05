// A collection's model as `content/<collection>/config.ts` declares it.
import { Result, Schema } from 'effect';

const common = {
  label: Schema.optional(Schema.String),
  help: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean)
};

const field = <T extends string, F extends Schema.Struct.Fields>(type: T, fields: F) => Schema.Struct({ type: Schema.Literal(type), ...common, ...fields });

const FieldSchema = Schema.Union([
  field('text', { max: Schema.optional(Schema.Int) }),
  field('textarea', { max: Schema.optional(Schema.Int) }),
  // Stored as the file's body; a collection has at most one.
  field('richtext', {}),
  field('number', { min: Schema.optional(Schema.Number), max: Schema.optional(Schema.Number) }),
  field('boolean', {}),
  field('date', {}),
  field('datetime', {}),
  field('tags', {}),
  field('image', {}),
  field('url', {}),
  field('select', { options: Schema.NonEmptyArray(Schema.String) }),
  // The slug of an entry in another collection.
  field('relation', { to: Schema.String }),
  field('json', {})
]);

export type Field = typeof FieldSchema.Type;

export const KINDS = ['posts', 'pages', 'single', 'records'] as const;

const ModelInput = Schema.Struct({
  name: Schema.NonEmptyString,
  kind: Schema.Literals(KINDS),
  titleField: Schema.optional(Schema.String),
  previewUrl: Schema.optional(Schema.String),
  fields: Schema.Record(Schema.String, FieldSchema)
});

/** A collection's model with its title and body fields resolved. */
export interface CollectionModel extends Omit<typeof ModelInput.Type, 'titleField'> {
  readonly titleField: string | undefined;
  /** The rich-text field stored as the file body, if any. */
  readonly bodyField: string | undefined;
}

const FIELD_KEY = /^[a-z][a-zA-Z0-9_]*$/;

// Frontmatter keys Venda itself uses; fields cannot take them.
export const RESERVED_KEYS = ['draft', 'publishedAt'] as const;

/** Rules that span fields, applied after the shapes decode. */
export function resolveModel(input: typeof ModelInput.Type): Result.Result<CollectionModel, string> {
  const keys = Object.keys(input.fields);
  const badKey = keys.find(key => !FIELD_KEY.test(key));

  if (badKey !== undefined) return Result.fail(`Field key "${badKey}" must start with a lowercase letter and use only letters, digits and underscores`);

  const reserved = keys.find(key => RESERVED_KEYS.some(name => name === key));

  if (reserved !== undefined) return Result.fail(`"${reserved}" is reserved by Venda and cannot be a field`);

  const bodies = keys.filter(key => input.fields[key]?.type === 'richtext');

  if (bodies.length > 1) return Result.fail(`Only one richtext field is allowed (found ${bodies.join(', ')}); it becomes the file body`);

  const titleField = input.titleField ?? (input.fields.title?.type === 'text' ? 'title' : undefined);

  if (titleField !== undefined && input.fields[titleField]?.type !== 'text') return Result.fail(`titleField "${titleField}" must name a text field`);

  if ((input.kind === 'posts' || input.kind === 'pages') && (titleField === undefined || bodies.length === 0)) {
    return Result.fail(`A ${input.kind} collection needs a text title field and a richtext body field`);
  }

  return Result.succeed({ ...input, titleField, bodyField: bodies[0] });
}

export const decodeModelInput = Schema.decodeUnknownResult(ModelInput);
