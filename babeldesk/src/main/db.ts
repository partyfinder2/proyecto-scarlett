/**
 * db.ts — BabelDesk SQLite (better-sqlite3, sync en main process).
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export type DbAccount = {
  id: string;
  network: string;
  display_name: string | null;
  external_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: number | null;
  meta_json: string | null;
  created_at: number;
  connection_status?: string | null;
  last_probe_at?: number | null;
  last_probe_error?: string | null;
  page_name?: string | null;
  ig_username?: string | null;
};

export type PublicAccount = {
  id: string;
  network: string;
  display_name: string | null;
  external_id: string | null;
  hasToken: boolean;
  token_expires_at: number | null;
  connection_status: string;
  page_name: string | null;
  ig_username: string | null;
  last_probe_at: number | null;
  last_probe_error: string | null;
  created_at: number;
};

export type DbMedia = {
  id: string;
  path: string;
  kind: "video" | "image";
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  public_url: string | null;
  created_at: number;
};

export type DbPost = {
  id: string;
  title: string | null;
  media_id: string | null;
  caption_default: string;
  link_url: string | null;
  level: string;
  created_at: number;
};

export type DbPostTarget = {
  id: string;
  post_id: string;
  account_id: string;
  caption_override: string | null;
  scheduled_at: number | null;
  status: string;
  external_post_id: string | null;
  error: string | null;
  attempt: number;
  status_since: number | null;
};

/** Segundos en `publishing` antes de volver a `queued` automáticamente. */
export const PUBLISHING_STALE_SEC = 300;

export type DbGroupCatalog = {
  id: string;
  name: string | null;
  url: string;
  notes: string | null;
  last_posted_at: number | null;
};

const MASTER_KEY_ENV = "STUDIO_MASTER_KEY";
const PLAIN_PREFIX = "plain:";

function getMasterKey(): Buffer | null {
  const raw = process.env[MASTER_KEY_ENV];
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptToken(plain: string): string {
  const key = getMasterKey();
  if (!key) {
    if (process.env.ALLOW_PLAIN_TOKENS === "1") {
      return PLAIN_PREFIX + Buffer.from(plain, "utf8").toString("base64");
    }
    throw new Error(
      "STUDIO_MASTER_KEY no configurada. Pon una frase en .env o ALLOW_PLAIN_TOKENS=1 solo en dev."
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
}

export function decryptToken(enc: string): string {
  if (enc.startsWith(PLAIN_PREFIX)) {
    return Buffer.from(enc.slice(PLAIN_PREFIX.length), "base64").toString("utf8");
  }
  const key = getMasterKey();
  if (!key) throw new Error("Token cifrado pero falta STUDIO_MASTER_KEY");
  const [ivHex, dataHex, tagHex] = enc.split(".");
  if (!ivHex || !dataHex || !tagHex) throw new Error("Token mal formado");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

let _db: Database.Database | null = null;

export function openDb(dbPath?: string): Database.Database {
  if (_db) return _db;

  const resolved = dbPath || path.join(process.cwd(), "data", "studio.sqlite");
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(resolved);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigration(_db);
  recoverStalePublishing(_db, PUBLISHING_STALE_SEC);
  return _db;
}

/**
 * Targets atascados en `publishing` (> maxAgeSec) → `queued` (sin reiniciar la app).
 */
export function recoverStalePublishing(
  db: Database.Database,
  maxAgeSec: number = PUBLISHING_STALE_SEC
): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSec;
  const result = db.prepare(`
    UPDATE post_targets
    SET status = 'queued',
        error = COALESCE(error, '') || ' [timeout publishing: reencolado automático]',
        status_since = ?
    WHERE status = 'publishing'
      AND (status_since IS NULL OR status_since <= ?)
  `).run(Math.floor(Date.now() / 1000), cutoff);
  const n = result.changes;
  if (n > 0) {
    log(db, "warn", `[queue] ${n} target(s) publishing → queued (stale > ${maxAgeSec}s)`);
  }
  return n;
}

function runMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      network TEXT NOT NULL,
      display_name TEXT,
      external_id TEXT,
      access_token_enc TEXT,
      refresh_token_enc TEXT,
      token_expires_at INTEGER,
      meta_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      public_url TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT,
      media_id TEXT,
      caption_default TEXT NOT NULL,
      link_url TEXT,
      level TEXT NOT NULL DEFAULT 'A_relax',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_targets (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      caption_override TEXT,
      scheduled_at INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      external_post_id TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 0
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
      at INTEGER NOT NULL,
      target_id TEXT,
      level TEXT,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_targets_status ON post_targets(status);
    CREATE INDEX IF NOT EXISTS idx_targets_scheduled ON post_targets(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_log_at ON job_log(at);
  `);
  ensureColumn(db, "post_targets", "status_since", "INTEGER");
  db.prepare(`
    UPDATE post_targets SET status_since = ?
    WHERE status_since IS NULL
  `).run(Math.floor(Date.now() / 1000));

  ensureColumn(db, "accounts", "connection_status", "TEXT");
  ensureColumn(db, "accounts", "last_probe_at", "INTEGER");
  ensureColumn(db, "accounts", "last_probe_error", "TEXT");
  ensureColumn(db, "accounts", "page_name", "TEXT");
  ensureColumn(db, "accounts", "ig_username", "TEXT");

  // Deduplicate media entries sharing the same file path
  db.exec(`
    DELETE FROM media
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY path ORDER BY created_at DESC) as rn
        FROM media
      ) WHERE rn = 1
    );
  `);

  // Impide dos filas del mismo MP4 (doble indexado del watcher).
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_path ON media(path);`);
}

const ASSIST_NETWORKS = new Set(["facebook_group", "tiktok"]);

export function deriveConnectionStatus(acc: DbAccount): string {
  if (acc.connection_status) return acc.connection_status;
  if (ASSIST_NETWORKS.has(acc.network)) return "assist_only";
  if (!acc.access_token_enc) return "disconnected";
  return "connected";
}

export function accountToPublic(acc: DbAccount): PublicAccount {
  return {
    id: acc.id,
    network: acc.network,
    display_name: acc.display_name,
    external_id: acc.external_id,
    hasToken: Boolean(acc.access_token_enc),
    token_expires_at: acc.token_expires_at,
    connection_status: deriveConnectionStatus(acc),
    page_name: acc.page_name ?? null,
    ig_username: acc.ig_username ?? null,
    last_probe_at: acc.last_probe_at ?? null,
    last_probe_error: acc.last_probe_error ?? null,
    created_at: acc.created_at,
  };
}

export function updateAccountProbeFields(
  db: Database.Database,
  id: string,
  fields: {
    connection_status: string;
    last_probe_at: number;
    last_probe_error: string | null;
    page_name?: string | null;
    ig_username?: string | null;
    token_expires_at?: number | null;
  }
): void {
  db.prepare(`
    UPDATE accounts SET
      connection_status = @connection_status,
      last_probe_at = @last_probe_at,
      last_probe_error = @last_probe_error,
      page_name = COALESCE(@page_name, page_name),
      ig_username = COALESCE(@ig_username, ig_username),
      token_expires_at = COALESCE(@token_expires_at, token_expires_at)
    WHERE id = @id
  `).run({
    id,
    connection_status: fields.connection_status,
    last_probe_at: fields.last_probe_at,
    last_probe_error: fields.last_probe_error,
    page_name: fields.page_name ?? null,
    ig_username: fields.ig_username ?? null,
    token_expires_at: fields.token_expires_at ?? null,
  });
}

export function disconnectAccountSecrets(db: Database.Database, id: string): void {
  db.prepare(`
    UPDATE accounts SET
      access_token_enc = NULL,
      refresh_token_enc = NULL,
      token_expires_at = NULL,
      connection_status = 'disconnected',
      last_probe_error = NULL,
      page_name = NULL,
      ig_username = NULL
    WHERE id = ?
  `).run(id);
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function listAccounts(db: Database.Database): DbAccount[] {
  return db.prepare("SELECT * FROM accounts ORDER BY created_at DESC").all() as DbAccount[];
}

export function getAccount(db: Database.Database, id: string): DbAccount | null {
  return (db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as DbAccount) || null;
}

export function findAccountByNetworkExternal(
  db: Database.Database,
  network: string,
  externalId: string
): DbAccount | null {
  return (
    (db
      .prepare("SELECT * FROM accounts WHERE network = ? AND external_id = ? LIMIT 1")
      .get(network, externalId) as DbAccount) || null
  );
}

export function upsertAccount(
  db: Database.Database,
  acc: Omit<DbAccount, "created_at"> & { created_at?: number }
): void {
  db.prepare(`
    INSERT INTO accounts (id, network, display_name, external_id, access_token_enc,
      refresh_token_enc, token_expires_at, meta_json, created_at, connection_status,
      page_name, ig_username)
    VALUES (@id, @network, @display_name, @external_id, @access_token_enc,
      @refresh_token_enc, @token_expires_at, @meta_json, @created_at, @connection_status,
      @page_name, @ig_username)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      external_id = excluded.external_id,
      access_token_enc = COALESCE(excluded.access_token_enc, access_token_enc),
      refresh_token_enc = COALESCE(excluded.refresh_token_enc, refresh_token_enc),
      token_expires_at = COALESCE(excluded.token_expires_at, token_expires_at),
      meta_json = excluded.meta_json,
      connection_status = COALESCE(excluded.connection_status, connection_status),
      page_name = COALESCE(excluded.page_name, page_name),
      ig_username = COALESCE(excluded.ig_username, ig_username)
  `).run({
    ...acc,
    connection_status: acc.connection_status ?? null,
    page_name: acc.page_name ?? null,
    ig_username: acc.ig_username ?? null,
    created_at: acc.created_at ?? Math.floor(Date.now() / 1000),
  });
}

export function deleteAccount(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

export function listPosts(db: Database.Database): DbPost[] {
  return db.prepare("SELECT * FROM posts ORDER BY created_at DESC").all() as DbPost[];
}

export function getPost(db: Database.Database, id: string): DbPost | null {
  return (db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as DbPost) || null;
}

export function insertPost(db: Database.Database, p: Omit<DbPost, "created_at">): void {
  db.prepare(`
    INSERT INTO posts (id, title, media_id, caption_default, link_url, level, created_at)
    VALUES (@id, @title, @media_id, @caption_default, @link_url, @level, @created_at)
  `).run({ ...p, created_at: Math.floor(Date.now() / 1000) });
}

export function listTargetsByStatus(db: Database.Database, status: string): DbPostTarget[] {
  return db
    .prepare("SELECT * FROM post_targets WHERE status = ? ORDER BY scheduled_at ASC")
    .all(status) as DbPostTarget[];
}

export function listTargetsWithAccounts(db: Database.Database, limit = 50) {
  return db
    .prepare(`
      SELECT t.*, a.network, a.display_name, p.title AS post_title, p.level
      FROM post_targets t
      JOIN accounts a ON a.id = t.account_id
      JOIN posts p ON p.id = t.post_id
      ORDER BY COALESCE(t.scheduled_at, 9999999999) ASC, t.id ASC
      LIMIT ?
    `)
    .all(limit);
}

export type HistoryFilters = {
  network?: string;
  status?: string;
  limit?: number;
};

/** Historial de publicaciones (últimos N targets, no draft). */
export function listHistory(db: Database.Database, filters: HistoryFilters = {}) {
  const limit = filters.limit ?? 100;
  const clauses: string[] = ["t.status != 'draft'"];
  const params: (string | number)[] = [];

  if (filters.network) {
    clauses.push("a.network = ?");
    params.push(filters.network);
  }
  if (filters.status) {
    clauses.push("t.status = ?");
    params.push(filters.status);
  }
  params.push(limit);

  return db
    .prepare(`
      SELECT
        t.id,
        t.status,
        t.error,
        t.status_since,
        t.scheduled_at,
        a.network,
        a.display_name,
        p.title,
        p.caption_default
      FROM post_targets t
      JOIN accounts a ON a.id = t.account_id
      JOIN posts p ON p.id = t.post_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY COALESCE(t.status_since, t.scheduled_at, 0) DESC
      LIMIT ?
    `)
    .all(...params);
}

export function getDueTargets(db: Database.Database): DbPostTarget[] {
  const now = Math.floor(Date.now() / 1000);
  return db
    .prepare(`
      SELECT t.* FROM post_targets t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.status = 'queued'
        AND (t.scheduled_at IS NULL OR t.scheduled_at <= ?)
        AND a.network IN ('facebook_page', 'instagram')
      ORDER BY t.scheduled_at ASC NULLS LAST
      LIMIT 20
    `)
    .all(now) as DbPostTarget[];
}

export function updateTargetStatus(
  db: Database.Database,
  id: string,
  status: string,
  extra: { error?: string; external_post_id?: string; attempt?: number } = {}
): void {
  const row = db.prepare("SELECT attempt FROM post_targets WHERE id = ?").get(id) as
    | { attempt: number }
    | undefined;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE post_targets
    SET status = @status,
        error = @error,
        external_post_id = @external_post_id,
        attempt = @attempt,
        status_since = @status_since
    WHERE id = @id
  `).run({
    id,
    status,
    error: extra.error ?? null,
    external_post_id: extra.external_post_id ?? null,
    attempt: extra.attempt ?? row?.attempt ?? 0,
    status_since: now,
  });
}

export function insertTarget(
  db: Database.Database,
  t: Omit<DbPostTarget, "attempt" | "status_since">
): void {
  db.prepare(`
    INSERT INTO post_targets
      (id, post_id, account_id, caption_override, scheduled_at, status, external_post_id, error, attempt, status_since)
    VALUES
      (@id, @post_id, @account_id, @caption_override, @scheduled_at, @status, @external_post_id, @error, 0, @status_since)
  `).run({
    ...t,
    external_post_id: t.external_post_id ?? null,
    error: t.error ?? null,
    status_since: Math.floor(Date.now() / 1000),
  });
}

export function listGroups(db: Database.Database): DbGroupCatalog[] {
  return db.prepare("SELECT * FROM group_catalog ORDER BY name ASC").all() as DbGroupCatalog[];
}

export function upsertGroup(db: Database.Database, g: DbGroupCatalog): void {
  db.prepare(`
    INSERT INTO group_catalog (id, name, url, notes, last_posted_at)
    VALUES (@id, @name, @url, @notes, @last_posted_at)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, notes = excluded.notes
  `).run(g);
}

export function log(
  db: Database.Database,
  level: "info" | "warn" | "error",
  message: string,
  targetId?: string
): void {
  db.prepare(`INSERT INTO job_log (at, target_id, level, message) VALUES (?, ?, ?, ?)`).run(
    Math.floor(Date.now() / 1000),
    targetId ?? null,
    level,
    message
  );
}

export function tailLog(db: Database.Database, limit = 100) {
  return db.prepare("SELECT * FROM job_log ORDER BY id DESC LIMIT ?").all(limit);
}

export function insertMedia(db: Database.Database, m: DbMedia): void {
  db.prepare(`
    INSERT OR REPLACE INTO media
      (id, path, kind, width, height, duration_ms, public_url, created_at)
    VALUES
      (@id, @path, @kind, @width, @height, @duration_ms, @public_url, @created_at)
  `).run({ ...m, created_at: m.created_at ?? Math.floor(Date.now() / 1000) });
}

export function getMedia(db: Database.Database, id: string): DbMedia | null {
  return (db.prepare("SELECT * FROM media WHERE id = ?").get(id) as DbMedia) || null;
}

export function listMedia(db: Database.Database): DbMedia[] {
  return db.prepare("SELECT * FROM media ORDER BY created_at DESC").all() as DbMedia[];
}

export function countPostsUsingMedia(db: Database.Database, mediaId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE media_id = ?").get(mediaId) as {
    n: number;
  };
  return row?.n ?? 0;
}

export function countMediaRowsWithPath(db: Database.Database, filePath: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM media WHERE path = ?").get(filePath) as {
    n: number;
  };
  return row?.n ?? 0;
}

export function deleteMediaRow(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
}
