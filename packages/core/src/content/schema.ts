// The index of the content files (docs/architecture.md). Derived from the
// files and disposable: a full sync rebuilds it. `drizzle-kit generate` turns
// changes here into migrations.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text
} from 'drizzle-orm/sqlite-core';

export const contentCollections = sqliteTable('content_collections', {
  slug: text().primaryKey(),
  path: text().notNull().unique(),
  modelJson: text('model_json').notNull()
});

export const contentEntries = sqliteTable(
  'content_entries',
  {
    collection: text().notNull(),
    slug: text().notNull(),
    path: text().notNull().unique(),
    draft: integer({ mode: 'boolean' }).notNull(),
    publishedAt: text('published_at'),
    dataJson: text('data_json').notNull(),
    sha: text().notNull()
  },
  table => [
    primaryKey({ columns: [table.collection, table.slug] }),
    index('content_entries_published').on(
      table.collection,
      table.draft,
      table.publishedAt
    )
  ]
);

// Every file the index has looked at, valid or not, so unchanged files are skipped.
export const contentFiles = sqliteTable('content_files', {
  path: text().primaryKey(),
  sha: text().notNull()
});

// Files that could not be read, with why and where.
export const contentProblems = sqliteTable('content_problems', {
  path: text().primaryKey(),
  message: text().notNull(),
  line: integer()
});
