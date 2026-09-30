-- Entries gain a published snapshot separate from the working copy, scheduling,
-- and soft deletion. SQLite cannot drop the old table-level UNIQUE(collection_id,
-- slug), so the table is rebuilt; slugs become unique among entries not in the trash.
CREATE TABLE entries_next (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  -- The working copy: what editors see and autosave.
  data_json TEXT NOT NULL DEFAULT '{}',
  -- What the public API serves; NULL while unpublished.
  published_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  publish_at TEXT,
  unpublish_at TEXT,
  schedule_error TEXT,
  deleted_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO entries_next (id, collection_id, slug, data_json, published_json, status, published_at, created_by, updated_by, created_at, updated_at)
SELECT id, collection_id, slug, data_json,
       CASE WHEN status = 'published' THEN data_json END,
       status,
       CASE WHEN status = 'published' THEN updated_at END,
       created_by, updated_by, created_at, updated_at
FROM entries;

DROP TABLE entries;
ALTER TABLE entries_next RENAME TO entries;

CREATE UNIQUE INDEX entries_live_slug ON entries(collection_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX entries_collection_status ON entries(collection_id, status) WHERE deleted_at IS NULL;
CREATE INDEX entries_publish_due ON entries(publish_at) WHERE publish_at IS NOT NULL;
CREATE INDEX entries_unpublish_due ON entries(unpublish_at) WHERE unpublish_at IS NOT NULL;
CREATE INDEX entries_trash ON entries(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE entry_revisions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  data_json TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('save', 'publish', 'restore')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX entry_revisions_entry ON entry_revisions(entry_id, created_at);

-- Lower-cased plain text for search; rows are kept in step with entries on write.
CREATE TABLE entry_search (
  entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  draft_title TEXT NOT NULL DEFAULT '',
  draft_text TEXT NOT NULL DEFAULT '',
  published_title TEXT NOT NULL DEFAULT '',
  published_text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX entry_search_collection ON entry_search(collection_id);
