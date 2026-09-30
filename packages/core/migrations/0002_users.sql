CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('administrator', 'editor', 'author', 'contributor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  password_hash TEXT,
  -- Bumped on password, role or status changes; sessions carrying an older value are rejected.
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'editor', 'author', 'contributor')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT
);

CREATE INDEX api_tokens_user ON api_tokens(user_id);

ALTER TABLE entries ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE entries ADD COLUMN updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL;
