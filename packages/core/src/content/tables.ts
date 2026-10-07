// Reads and writes of the content index (schema.ts).
import { modelFrom, type CollectionModel, type Entry } from '@venda/content';
import { and, eq, like, ne } from 'drizzle-orm';
import { DateTime, Effect, Option, Result, Schema } from 'effect';
import {
  contentCollections,
  contentEntries,
  contentFiles,
  contentProblems
} from './schema';
import { sortKey } from './order';
import { Database } from '../database';

const decodeModel = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

/** The SHA the index last saw for each path. */
export const knownFiles = Effect.gen(function* () {
  const db = yield* Database;
  const rows = yield* db.select().from(contentFiles);

  return new Map(rows.map(row => [row.path, row.sha]));
});

export const markFile = (path: string, sha: string) =>
  Effect.flatMap(Database, db =>
    db
      .insert(contentFiles)
      .values({ path, sha })
      .onConflictDoUpdate({ target: contentFiles.path, set: { sha } })
  );

export const forgetFile = (path: string) =>
  Effect.flatMap(Database, db =>
    db.delete(contentFiles).where(eq(contentFiles.path, path))
  );

export const recordProblem = (
  path: string,
  message: string,
  line: number | undefined
) =>
  Effect.flatMap(Database, db => {
    const problem = { message, line: line ?? null };

    return db
      .insert(contentProblems)
      .values({ path, ...problem })
      .onConflictDoUpdate({ target: contentProblems.path, set: problem });
  });

export const clearProblem = (path: string) =>
  Effect.flatMap(Database, db =>
    db.delete(contentProblems).where(eq(contentProblems.path, path))
  );

/** A collection's model as last indexed, if its config was valid. */
export const modelOf = (collection: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ modelJson: contentCollections.modelJson })
      .from(contentCollections)
      .where(eq(contentCollections.slug, collection));

    return Option.flatMap(Option.fromNullishOr(row), ({ modelJson }) =>
      Option.flatMap(decodeModel(modelJson), json =>
        Result.getSuccess(modelFrom(json))
      )
    );
  });

export const hasCollection = (collection: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ slug: contentCollections.slug })
      .from(contentCollections)
      .where(eq(contentCollections.slug, collection));

    return row !== undefined;
  });

export const saveCollection = (
  slug: string,
  path: string,
  model: CollectionModel
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const values = { path, modelJson: JSON.stringify(model) };

    yield* db
      .insert(contentCollections)
      .values({ slug, ...values })
      .onConflictDoUpdate({ target: contentCollections.slug, set: values });
  });

// A collection's files other than its config.
const entryFilesOf = (slug: string, configPath: string) =>
  and(like(contentFiles.path, `${slug}/%`), ne(contentFiles.path, configPath));

/** Forgets the entry files of a collection, so the next sync reads them against its new model. */
export const staleEntries = (slug: string, configPath: string) =>
  Effect.flatMap(Database, db =>
    db.delete(contentFiles).where(entryFilesOf(slug, configPath))
  );

/** Drops a collection and its entries, and forgets its entry files so they are read again against a new model. */
export const dropCollection = (slug: string, configPath: string) =>
  Effect.gen(function* () {
    const db = yield* Database;

    yield* db
      .delete(contentCollections)
      .where(eq(contentCollections.slug, slug));
    yield* db.delete(contentEntries).where(eq(contentEntries.collection, slug));
    yield* staleEntries(slug, configPath);
  });

export const dropEntry = (path: string) =>
  Effect.flatMap(Database, db =>
    db.delete(contentEntries).where(eq(contentEntries.path, path))
  );

/** The other file already using an entry's slug, if any (`a.md` and `a.mdx`). */
export const slugOwner = (collection: string, slug: string, path: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const others = and(
      eq(contentEntries.collection, collection),
      eq(contentEntries.slug, slug),
      ne(contentEntries.path, path)
    );
    const [row] = yield* db
      .select({ path: contentEntries.path })
      .from(contentEntries)
      .where(others);

    return Option.map(Option.fromNullishOr(row), each => each.path);
  });

/** `publishedAt` in UTC, so the index can compare it as text. */
const utc = (value: string | undefined) =>
  Option.getOrNull(
    Option.map(
      Option.flatMap(Option.fromNullishOr(value), text => DateTime.make(text)),
      DateTime.formatIso
    )
  );

export const saveEntry = (
  path: string,
  sha: string,
  entry: Entry,
  model: CollectionModel
) =>
  Effect.flatMap(Database, db => {
    const publishedAt = utc(entry.publishedAt);
    const values = {
      slug: entry.slug,
      draft: entry.draft,
      publishedAt,
      dataJson: JSON.stringify(entry.data),
      sha,
      sortKey: sortKey(model, entry, publishedAt)
    };

    return db
      .insert(contentEntries)
      .values({ collection: entry.collection, path, ...values })
      .onConflictDoUpdate({ target: contentEntries.path, set: values });
  });
