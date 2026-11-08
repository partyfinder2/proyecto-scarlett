import chokidar from "chokidar";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { insertMedia, countMediaRowsWithPath, log } from "./db";
import { shouldIndexInboxFile } from "../connectors/inboxMediaFilter";

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function normalizeMediaPath(filePath: string): string {
  try {
    return path.resolve(filePath);
  } catch {
    return filePath;
  }
}

export function startInboxWatcher(db: Database.Database, inboxDir: string): () => void {
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

  /** Evita carrera add/add: dos inserts del mismo path con UUID distinto. */
  const indexing = new Set<string>();

  const indexFile = (rawPath: string) => {
    const absPath = normalizeMediaPath(rawPath);
    if (!shouldIndexInboxFile(absPath)) return;

    const ext = path.extname(absPath).toLowerCase();
    let kind: "video" | "image" | null = null;
    if (VIDEO_EXT.has(ext)) kind = "video";
    else if (IMAGE_EXT.has(ext)) kind = "image";
    if (!kind) return;

    const key = absPath.toLowerCase();
    if (indexing.has(key)) return;
    if (countMediaRowsWithPath(db, absPath) > 0) return;

    indexing.add(key);
    try {
      if (countMediaRowsWithPath(db, absPath) > 0) return;
      const id = crypto.randomUUID();
      insertMedia(db, {
        id,
        path: absPath,
        kind,
        width: null,
        height: null,
        duration_ms: null,
        public_url: null,
        created_at: Math.floor(Date.now() / 1000),
      });
      log(db, "info", `Inbox: indexado ${path.basename(absPath)} (${kind})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE|unique/i.test(msg)) {
        log(db, "warn", `Inbox: no se pudo indexar ${path.basename(absPath)}: ${msg}`);
      }
    } finally {
      indexing.delete(key);
    }
  };

  const watcher = chokidar.watch(inboxDir, {
    ignoreInitial: false,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
  });

  watcher.on("add", indexFile);
  return () => watcher.close();
}
