import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import Database from "better-sqlite3";
import { insertMedia, listMedia } from "./db";
import { applySidecarForJson, readSidecarMeta } from "./inbox-watcher";

function makeMediaDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE media (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      public_url TEXT,
      title TEXT,
      caption TEXT,
      meta_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_media_path ON media(path);
  `);
  return db;
}

describe("inbox sidecar .json", () => {
  test("readSidecarMeta lee title y caption desde .json gemelo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-sidecar-"));
    try {
      const mp4 = path.join(dir, "ranking_20261110.mp4");
      const json = path.join(dir, "ranking_20261110.json");
      fs.writeFileSync(mp4, "dummy");
      fs.writeFileSync(
        json,
        JSON.stringify({
          title: "TOP 5 HERRAMIENTAS DE IA",
          caption: "Mira el top 5 completo en labelbabel.com",
          fuente: "ranking-app",
        }),
        "utf8"
      );

      const meta = readSidecarMeta(mp4);
      assert.equal(meta.title, "TOP 5 HERRAMIENTAS DE IA");
      assert.equal(meta.caption, "Mira el top 5 completo en labelbabel.com");
      assert.ok(meta.meta_json?.includes("ranking-app"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applySidecarForJson actualiza media existente si el .json llega después del .mp4", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bd-sidecar-late-"));
    try {
      const mp4 = path.resolve(path.join(dir, "clip_01.mp4"));
      const json = path.resolve(path.join(dir, "clip_01.json"));
      fs.writeFileSync(mp4, "dummy");

      const db = makeMediaDb();
      insertMedia(db, {
        id: "m1",
        path: mp4,
        kind: "video",
        width: null,
        height: null,
        duration_ms: null,
        public_url: null,
        created_at: 1000,
      });

      fs.writeFileSync(
        json,
        JSON.stringify({ titulo: "Top 5 Finanzas", copy: "Invierte mejor hoy" }),
        "utf8"
      );

      const updated = applySidecarForJson(db, json);
      assert.equal(updated, 1);

      const rows = listMedia(db);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].title, "Top 5 Finanzas");
      assert.equal(rows[0].caption, "Invierte mejor hoy");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
