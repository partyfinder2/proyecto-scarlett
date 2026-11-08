import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Database from "better-sqlite3";
import { insertPost, insertTarget, listTargetsByStatus, encryptToken } from "../main/db";
import { runSchedulerTick, runManualAssistTarget } from "./worker";
import type { GroupAssistDeps } from "../connectors/groupAssist";

process.env.ALLOW_PLAIN_TOKENS = "1";

function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, network TEXT NOT NULL, display_name TEXT, external_id TEXT,
      access_token_enc TEXT, refresh_token_enc TEXT, token_expires_at INTEGER, meta_json TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE media (id TEXT PRIMARY KEY, path TEXT NOT NULL, kind TEXT NOT NULL, width INTEGER, height INTEGER,
      duration_ms INTEGER, public_url TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT, media_id TEXT, caption_default TEXT NOT NULL,
      link_url TEXT, level TEXT NOT NULL DEFAULT 'A_relax', created_at INTEGER NOT NULL);
    CREATE TABLE post_targets (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, account_id TEXT NOT NULL,
      caption_override TEXT, scheduled_at INTEGER, status TEXT NOT NULL DEFAULT 'draft',
      external_post_id TEXT, error TEXT, attempt INTEGER NOT NULL DEFAULT 0, status_since INTEGER);
    CREATE TABLE group_catalog (id TEXT PRIMARY KEY, name TEXT, url TEXT NOT NULL, notes TEXT, last_posted_at INTEGER);
    CREATE TABLE job_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, target_id TEXT, level TEXT, message TEXT);
  `);
  return db;
}

function seedAccount(db: Database.Database, overrides: Partial<{ id: string; network: string; meta_json: string; token?: string }> = {}) {
  const id = overrides.id ?? "acc-1";
  db.prepare(`INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id,
    overrides.network ?? "facebook_page",
    "Test",
    "ext",
    overrides.token ? encryptToken(overrides.token) : encryptToken("tok"),
    null,
    null,
    overrides.meta_json ?? JSON.stringify({ pageId: "p1" }),
    Math.floor(Date.now() / 1000)
  );
  return id;
}

function seedPost(db: Database.Database, level = "A_relax") {
  insertPost(db, {
    id: "post-1",
    title: "t",
    media_id: null,
    caption_default: "cap",
    link_url: null,
    level,
  });
  return "post-1";
}

const noOpAssist: GroupAssistDeps = {
  copyToClipboard: async () => {},
  openExternal: async () => {},
};

describe("scheduler BabelDesk", () => {
  test("nivel B + Page → skipped", async () => {
    const db = makeTestDb();
    const acc = seedAccount(db, { network: "facebook_page" });
    seedPost(db, "B_moderado");
    insertTarget(db, {
      id: "t1",
      post_id: "post-1",
      account_id: acc,
      caption_override: null,
      scheduled_at: null,
      status: "queued",
      external_post_id: null,
      error: null,
    });
    await runSchedulerTick({ db, assistDeps: noOpAssist });
    const [t] = listTargetsByStatus(db, "skipped");
    assert.ok(t);
  });

  test("grupo NO se procesa en cron", async () => {
    const db = makeTestDb();
    seedAccount(db, { id: "g1", network: "facebook_group", meta_json: JSON.stringify({ groupUrl: "https://facebook.com/groups/x" }) });
    seedPost(db);
    insertTarget(db, {
      id: "tg",
      post_id: "post-1",
      account_id: "g1",
      caption_override: null,
      scheduled_at: null,
      status: "queued",
      external_post_id: null,
      error: null,
    });
    await runSchedulerTick({ db, assistDeps: noOpAssist });
    const [t] = listTargetsByStatus(db, "queued");
    assert.ok(t, "Grupo sigue en cola hasta assist manual");
  });

  test("assist manual grupo → awaiting_human", async () => {
    const db = makeTestDb();
    seedAccount(db, { id: "g1", network: "facebook_group", meta_json: JSON.stringify({ groupUrl: "https://facebook.com/groups/x" }) });
    seedPost(db);
    insertTarget(db, {
      id: "tg",
      post_id: "post-1",
      account_id: "g1",
      caption_override: null,
      scheduled_at: null,
      status: "queued",
      external_post_id: null,
      error: null,
    });
    await runManualAssistTarget("tg", { db, assistDeps: noOpAssist });
    const [t] = listTargetsByStatus(db, "awaiting_human");
    assert.ok(t);
  });
});
