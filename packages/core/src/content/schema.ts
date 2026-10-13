// The content files, their revisions, the index derived from them and the
// operational state around them (docs/architecture.md). `drizzle-kit
// generate` turns changes here into migrations.
import { sql } from 'drizzle-orm';
import {
  check,
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
    status: text({ enum: ['active', 'trashed'] })
      .notNull()
      .default('active'),
    trashSha: text('trash_sha'),
    trashedAt: text('trashed_at'),
    trashedBy: text('trashed_by'),
    // Null for an entry created in the admin that has no file yet.
    baseSha: text('base_sha'),
    dataJson: text('data_json').notNull(),
    extraJson: text('extra_json').notNull(),
    publishedAt: text('published_at'),
    revision: integer().notNull().default(0),
    dirty: integer({ mode: 'boolean' }).notNull().default(false),
    ownerId: text('owner_id'),
    updatedBy: text('updated_by'),
    updatedAt: text('updated_at')
  },
  table => [
    primaryKey({ columns: [table.collection, table.slug] }),
    index('content_work_trash').on(
      table.status,
      table.trashedAt,
      table.collection,
      table.slug
    ),
    check(
      'content_work_trash_state',
      sql`
      (${table.status} = 'active' AND ${table.trashSha} IS NULL
        AND ${table.trashedAt} IS NULL AND ${table.trashedBy} IS NULL)
      OR (${table.status} = 'trashed' AND ${table.trashSha} IS NOT NULL
        AND ${table.trashedAt} IS NOT NULL AND ${table.trashedBy} IS NOT NULL)
    `
    )
  ]
);

// The content itself: `site.ts`, each `<collection>/config.ts` and each entry
// file, as text with its git blob SHA. Everything else here is derived from
// these rows, in the same batch as each write (files.ts).
export const contentFiles = sqliteTable('content_files', {
  path: text().primaryKey(),
  text: text().notNull(),
  sha: text().notNull(),
  size: integer().notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by')
});

// Every version ever written, kept indefinitely; `text` is null for a deletion.
export const contentRevisions = sqliteTable(
  'content_revisions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    path: text().notNull(),
    sha: text(),
    text: text(),
    parentSha: text('parent_sha'),
    message: text().notNull(),
    authorId: text('author_id'),
    authorName: text('author_name').notNull(),
    createdAt: text('created_at').notNull()
  },
  table => [index('content_revisions_path').on(table.path, table.id)]
);

// Never holds a row: a guarded batch inserts `ok` and deletes it again, and
// the CHECK aborts the whole batch when the guard's condition is false.
export const contentGuard = sqliteTable(
  'content_guard',
  { ok: integer().notNull() },
  table => [check('content_guard_ok', sql`${table.ok} = 1`)]
);

// Files that could not be read, with why and where.
export const contentProblems = sqliteTable('content_problems', {
  path: text().primaryKey(),
  message: text().notNull(),
  line: integer()
});
