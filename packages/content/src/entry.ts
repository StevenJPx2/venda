// An entry file: `<collection>/<slug>.md` (or `.mdx`) with YAML frontmatter
// for its fields and Markdown for its rich-text body.
import type { RichTextDoc } from '@venda/richtext';
import { Effect, Option, Result, Schema } from 'effect';
import {
  Document,
  isMap,
  isScalar,
  LineCounter,
  parseDocument,
  visit
} from 'yaml';
import { InvalidEntry } from './errors';
import { fieldSchema, IsoDateTime } from './fields';
import { markdownToDoc } from './from-markdown';
import type { Json } from './literal';
import { RESERVED_KEYS, type CollectionModel } from './model';
import { docToMarkdown } from './to-markdown';

/** A field's value: data from frontmatter, or the body's document. */
export type FieldValue = Json | RichTextDoc;

export interface Entry {
  readonly collection: string;
  readonly slug: string;
  readonly draft: boolean;
  readonly publishedAt: string | undefined;
  /** Field values by key; the body field holds its document. */
  readonly data: Readonly<Record<string, FieldValue>>;
  /** Frontmatter keys the model does not declare, kept as written. */
  readonly extra: Readonly<Record<string, Json>>;
}

const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*';

const ENTRY_PATH = new RegExp(`^(${NAME})/(${NAME})\\.mdx?$`);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

/** The collection and slug an entry path names, if it is one. */
export function entryPath(
  path: string
): Option.Option<{ collection: string; slug: string }> {
  const match = ENTRY_PATH.exec(path);

  return match?.[1] && match[2]
    ? Option.some({ collection: match[1], slug: match[2] })
    : Option.none();
}

interface Problem {
  readonly message: string;
  readonly line: number | undefined;
}

interface Frontmatter {
  readonly values: Readonly<Record<string, Json>>;
  readonly lineOf: (key: string) => number | undefined;
  readonly body: string;
  readonly bodyLine: number;
}

const decodeValues = Schema.decodeUnknownOption(
  Schema.NullishOr(Schema.Record(Schema.String, Schema.Json))
);

/** A file's frontmatter YAML, its body, and the file line the body starts after. */
function split(source: string) {
  const [consumed = '', yaml = ''] = FRONTMATTER.exec(source) ?? [];
  const bodyLine =
    consumed.split('\n').length - (consumed.endsWith('\n') ? 1 : 0);

  return { yaml, body: source.slice(consumed.length), bodyLine };
}

function frontmatter(source: string): Result.Result<Frontmatter, Problem> {
  const { yaml, body, bodyLine } = split(source);
  const lines = new LineCounter();
  const document = parseDocument(yaml, {
    lineCounter: lines,
    uniqueKeys: true
  });
  const [error] = document.errors;

  if (error)
    return Result.fail({
      message: `Frontmatter is not valid YAML: ${error.message.split('\n')[0] ?? ''}`,
      line: (error.linePos?.[0].line ?? 0) + 1
    });

  const values = decodeValues(document.toJS());

  if (Option.isNone(values))
    return Result.fail({
      message: 'Frontmatter must be a set of `key: value` lines',
      line: 2
    });

  return Result.succeed({
    values: values.value ?? {},
    lineOf: keyLines(document, lines),
    body,
    bodyLine
  });
}

/** The file line each top-level frontmatter key is on (the file's line 1 is the opening `---`). */
function keyLines(
  document: Document,
  lines: LineCounter
): (key: string) => number | undefined {
  return key => {
    const pair = isMap(document.contents)
      ? document.contents.items.find(
          item => isScalar(item.key) && item.key.value === key
        )
      : undefined;
    const offset = isScalar(pair?.key) ? pair.key.range?.[0] : undefined;

    return offset === undefined ? undefined : lines.linePos(offset).line + 1;
  };
}

/** Each field's value: the body read as a document, the rest decoded from frontmatter. */
function readFields(
  model: CollectionModel,
  { values, lineOf, body, bodyLine }: Frontmatter
): Result.Result<Record<string, FieldValue>, Problem> {
  return Result.gen(function* () {
    const data: Record<string, FieldValue> = {};

    for (const [key, field] of Object.entries(model.fields)) {
      const schema = fieldSchema(field);
      const value = values[key];

      if (schema === undefined) {
        data[key] = yield* Result.mapError(
          markdownToDoc(body),
          ({ message, line }) => ({
            message,
            line: line === undefined ? undefined : line + bodyLine
          })
        );
      } else if (value !== undefined && !isEmpty(value)) {
        data[key] = yield* Result.mapError(
          Schema.decodeUnknownResult(schema)(value),
          error => ({ message: `${key}: ${error.message}`, line: lineOf(key) })
        );
      }
    }

    return data;
  });
}

const isDoc = Schema.is(
  Schema.Struct({
    type: Schema.Literal('doc'),
    content: Schema.Array(Schema.Any)
  })
);

const isEmpty = (value: FieldValue | undefined): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (isDoc(value) && value.content.length === 0);

const decodeDraft = Schema.decodeUnknownResult(Schema.optional(Schema.Boolean));

const decodePublishedAt = Schema.decodeUnknownResult(
  Schema.optional(IsoDateTime)
);

/** The entry a file spells out, or the line where it does not fit the model. */
export const readEntry = Effect.fnUntraced(function* (
  model: CollectionModel,
  path: string,
  source: string
) {
  const fail = (message: string, line?: number) =>
    new InvalidEntry({ path, message, line });
  const location = entryPath(path);

  if (Option.isNone(location))
    return yield* fail(
      'Entry files are named <collection>/<slug>.md, with a lowercase, hyphenated slug'
    );

  const parsed = frontmatter(source);

  if (Result.isFailure(parsed))
    return yield* fail(parsed.failure.message, parsed.failure.line);

  const { values, lineOf } = parsed.success;
  const draft = decodeDraft(values.draft);
  const publishedAt = decodePublishedAt(values.publishedAt);
  const fields = readFields(model, parsed.success);

  if (Result.isFailure(draft))
    return yield* fail('draft must be true or false', lineOf('draft'));
  if (Result.isFailure(publishedAt))
    return yield* fail(
      `publishedAt: ${publishedAt.failure.message}`,
      lineOf('publishedAt')
    );
  if (Result.isFailure(fields))
    return yield* fail(fields.failure.message, fields.failure.line);

  const data = fields.success;
  const isDraft = draft.success === true;
  const missing = Object.entries(model.fields).find(
    ([key, field]) => field.required && isEmpty(data[key])
  );

  if (!isDraft && missing)
    return yield* fail(
      `${missing[0]} is required to publish; add it or set draft: true`,
      lineOf(missing[0])
    );

  const known = new Set<string>([
    ...Object.keys(model.fields),
    ...RESERVED_KEYS
  ]);
  const extra = Object.fromEntries(
    Object.entries(values).filter(([key]) => !known.has(key))
  );

  return {
    ...location.value,
    draft: isDraft,
    publishedAt: publishedAt.success,
    data,
    extra
  } satisfies Entry;
});

// Lists of plain values stay on one line, as in `tags: [one, two]`.
function yaml(values: Readonly<Record<string, FieldValue>>): string {
  const document = new Document(values);

  visit(document, {
    Seq(_key, node) {
      if (node.items.every(isScalar)) node.flow = true;
    }
  });

  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** The file for an entry: the model's fields in order, then Venda's keys, then the rest. */
export function writeEntry(model: CollectionModel, entry: Entry): string {
  const values: Record<string, FieldValue> = {};

  for (const [key, field] of Object.entries(model.fields)) {
    const value = entry.data[key];

    if (field.type !== 'richtext' && value !== undefined && !isEmpty(value))
      values[key] = value;
  }

  if (entry.publishedAt !== undefined) values.publishedAt = entry.publishedAt;
  if (entry.draft) values.draft = true;

  Object.assign(values, entry.extra);

  const head = Object.keys(values).length ? `---\n${yaml(values)}---\n` : '';
  const body =
    model.bodyField === undefined ? undefined : entry.data[model.bodyField];
  const markdown = isDoc(body) ? docToMarkdown(body) : '';

  return head && markdown ? `${head}\n${markdown}` : head + markdown;
}
