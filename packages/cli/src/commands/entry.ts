// One entry: read it as the index has it, or set some of its fields and
// publish the file, read and written against its collection's model exactly
// as the admin writes it, from the SHA it was read at.
import {
  checkEntryData,
  markdownToDoc,
  readCollectionConfig,
  readEntry,
  writeEntry,
  type CollectionModel,
  type Entry,
  type FieldValue,
  type Json
} from '@venda/content';
import { readFile } from 'node:fs/promises';
import { Effect, Result, Schema } from 'effect';
import { request, siteFile } from '../client';
import { report, type Context } from '../context';
import { CliFailure } from '../failure';

export interface Assignments {
  /** `field=text`. */
  readonly set: ReadonlyArray<string>;
  /** `field=<JSON>`: numbers, booleans, lists, null. */
  readonly json: ReadonlyArray<string>;
  /** `field=<Markdown file>`, for rich-text fields. */
  readonly markdown: ReadonlyArray<string>;
}

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const dataFrom = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

function split(pair: string) {
  const at = pair.indexOf('=');

  if (at <= 0)
    throw new CliFailure('BadArgument', `${pair}: expected field=value`);

  return [pair.slice(0, at), pair.slice(at + 1)] as const;
}

/** The fields to set: `markdown` maps each field to its file's Markdown, already read. */
export function fieldValues(
  assignments: Assignments,
  markdown: ReadonlyMap<string, string>
) {
  const values: Record<string, FieldValue> = {};

  for (const [field, text] of assignments.set.map(split)) values[field] = text;

  for (const [field, raw] of assignments.json.map(split))
    values[field] = Result.getOrThrowWith(
      Result.try(() => decodeJson(raw)),
      () => new CliFailure('BadArgument', `${field}: ${raw} is not JSON`)
    );

  for (const [field, source] of markdown) {
    const doc = markdownToDoc(source);

    if (Result.isFailure(doc))
      throw new CliFailure('BadArgument', `${field}: ${doc.failure.message}`);

    values[field] = doc.success;
  }

  return values;
}

/** Reads a file's content against the model; a failure is the file's problem, in words. */
async function parsed<A>(
  path: string,
  effect: Effect.Effect<A, { readonly message: string }>
) {
  const result = await Effect.runPromise(Effect.result(effect));

  if (Result.isFailure(result))
    throw new CliFailure(
      'InvalidContent',
      `${path}: ${result.failure.message}`,
      path
    );

  return result.success;
}

async function modelOf(context: Context, collection: string) {
  const path = `${collection}/config.ts`;
  const config = await siteFile(context.api, path);

  if (config === null)
    throw new CliFailure(
      'CollectionNotFound',
      `The site has no collection ${collection}`
    );

  return parsed(path, readCollectionConfig(path, config.text));
}

/** The entry's file as it is, or a new one. */
async function entryFile(
  context: Context,
  model: CollectionModel,
  collection: string,
  slug: string
) {
  for (const path of [
    `${collection}/${slug}.md`,
    `${collection}/${slug}.mdx`
  ]) {
    const file = await siteFile(context.api, path);

    if (file !== null)
      return {
        path,
        baseSha: file.sha,
        entry: await parsed(path, readEntry(model, path, file.text))
      };
  }

  const entry: Entry = {
    collection,
    slug,
    draft: false,
    publishedAt: undefined,
    data: {},
    extra: {}
  };

  return { path: `${collection}/${slug}.md`, baseSha: null, entry };
}

export async function entryGet(
  context: Context,
  collection: string,
  slug: string
) {
  const entry = await request(
    context.api.adminContent.entry({ params: { collection, slug } })
  );
  const json = JSON.stringify(entry, null, 2);

  return { text: json, json };
}

export async function entrySet(
  context: Context,
  target: { readonly collection: string; readonly slug: string },
  assignments: Assignments,
  message: string | undefined
) {
  const markdown = new Map<string, string>();

  for (const [field, file] of assignments.markdown.map(split))
    markdown.set(field, await readFile(file, 'utf8'));

  const changes = fieldValues(assignments, markdown);
  const model = await modelOf(context, target.collection);
  const file = await entryFile(context, model, target.collection, target.slug);
  const data: Readonly<Record<string, Json>> = dataFrom(
    JSON.stringify({ ...file.entry.data, ...changes })
  );
  const checked = checkEntryData(model, data, file.entry.publishedAt ?? null);

  if (Result.isFailure(checked))
    throw new CliFailure(
      'InvalidContent',
      `${file.path}: ${checked.failure}`,
      file.path
    );

  await request(
    context.api.files.write({
      payload: {
        message: message ?? `Update ${target.collection}/${target.slug}`,
        changes: [
          {
            path: file.path,
            text: writeEntry(model, { ...file.entry, data }),
            baseSha: file.baseSha
          }
        ]
      }
    })
  );

  return report(
    `${file.baseSha === null ? 'Created' : 'Published'} ${file.path}`,
    { path: file.path, created: file.baseSha === null }
  );
}
