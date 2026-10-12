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
    sha: text().notNull(),
    // The admin's order for the collection's kind (order.ts), then the slug.
    sortKey: text('sort_key').notNull().default('')
  },
  table => [
    primaryKey({ columns: [table.collection, table.slug] }),
    index('content_entries_published').on(
      table.collection,
      table.draft,
      table.publishedAt
    ),
    index('content_entries_admin_order').on(
      table.collection,
      table.sortKey,
      table.slug
    )
  ]
);

// The site's own settings from `site.ts`: one row while that file is valid.
export const contentSite = sqliteTable('content_site', {
  path: text().primaryKey(),
  settingsJson: text('settings_json').notNull()
});

// Operational state survives publishing and discard: revisions never reset.
// Ownership is independent of the Markdown's byline fields.
export const contentWork = sqliteTable(
  'content_work',
  {
    collection: text().notNull(),
    slug: text().notNull(),
    path: text().notNull().unique(),
    // Null for an entry created in the admin that has no file yet.
    baseSha: text('base_sha'),
    dataJson: text('data_json').notNull(),
    extraJson: text('extra_json').notNull(),
    publishedAt: text('published_at'),
    revision: integer().notNull().default(0),
    dirty: integer({ mode: 'boolean' }).notNull().default(false),
    ownerId: text('owner_id'),
    updatedBy: text('updated_by'),
    updatedAt: text('updated_at'),
    // Frozen canonical publish payload; a retry completes this exact intent.
    publishText: text('publish_text'),
    publishSha: text('publish_sha'),
    publishModelJson: text('publish_model_json')
  },
  table => [primaryKey({ columns: [table.collection, table.slug] })]
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
