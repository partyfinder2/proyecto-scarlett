import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Database from "better-sqlite3";
import { recoverStalePublishing, PUBLISHING_STALE_SEC } from "./db";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE post_targets (
      id TEXT PRIMARY KEY, post_id TEXT, account_id TEXT, caption_override TEXT,
      scheduled_at INTEGER, status TEXT, external_post_id TEXT, error TEXT,
      attempt INTEGER DEFAULT 0, status_since INTEGER
    );
    CREATE TABLE job_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, target_id TEXT, level TEXT, message TEXT
    );
  `);
  return db;
}

describe("recoverStalePublishing", () => {
  test("publishing reciente no se toca", () => {
    const db = makeDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO post_targets VALUES ('t1','p','a',NULL,NULL,'publishing',NULL,NULL,1,?)`).run(
      now - 60
    );
    const n = recoverStalePublishing(db, PUBLISHING_STALE_SEC);
    assert.equal(n, 0);
    const row = db.prepare("SELECT status FROM post_targets WHERE id='t1'").get() as { status: string };
    assert.equal(row.status, "publishing");
  });

  test("publishing > 5 min → queued", () => {
    const db = makeDb();
    const old = Math.floor(Date.now() / 1000) - PUBLISHING_STALE_SEC - 10;
    db.prepare(`INSERT INTO post_targets VALUES ('t2','p','a',NULL,NULL,'publishing',NULL,NULL,1,?)`).run(
      old
    );
    const n = recoverStalePublishing(db, PUBLISHING_STALE_SEC);
    assert.equal(n, 1);
    const row = db.prepare("SELECT status, error FROM post_targets WHERE id='t2'").get() as {
      status: string;
      error: string;
    };
    assert.equal(row.status, "queued");
    assert.match(row.error, /timeout publishing/i);
  });
});
