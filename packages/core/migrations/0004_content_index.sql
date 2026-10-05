-- The index of the content files (docs/architecture.md). Derived from the
-- files and disposable: a full sync rebuilds it.

CREATE TABLE content_collections (
  slug TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  model_json TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE TABLE content_entries (
  collection TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  draft INTEGER NOT NULL,
  published_at TEXT,
  data_json TEXT NOT NULL,
  sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (collection, slug)
);

CREATE INDEX content_entries_published ON content_entries (collection, draft, published_at);

-- Every file the index has looked at, valid or not, so unchanged files are skipped.
CREATE TABLE content_files (
  path TEXT PRIMARY KEY,
  sha TEXT NOT NULL
);

-- Files that could not be read, with why and where.
CREATE TABLE content_problems (
  path TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  line INTEGER,
  recorded_at TEXT NOT NULL
);
