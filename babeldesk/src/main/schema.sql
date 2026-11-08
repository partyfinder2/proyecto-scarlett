-- VENUZ Social Studio — schema v1
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  display_name TEXT,
  external_id TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at INTEGER,
  meta_json TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  public_url TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  media_id TEXT,
  caption_default TEXT,
  link_url TEXT,
  level TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  caption_override TEXT,
  scheduled_at INTEGER,
  status TEXT NOT NULL,
  external_post_id TEXT,
  error TEXT,
  attempt INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  url TEXT NOT NULL,
  notes TEXT,
  last_posted_at INTEGER
);

CREATE TABLE IF NOT EXISTS job_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER,
  target_id TEXT,
  level TEXT,
  message TEXT
);
