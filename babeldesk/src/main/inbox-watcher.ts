import chokidar from "chokidar";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import type Database from "better-sqlite3";
import {
  insertMedia,
  countMediaRowsWithPath,
  updateMediaMetadataByPath,
  log,
} from "./db";
import { shouldIndexInboxFile } from "../connectors/inboxMediaFilter";

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type SidecarMediaMeta = {
  title: string | null;
  caption: string | null;
  meta_json: string | null;
};

function normalizeMediaPath(filePath: string): string {
  try {
    return path.resolve(filePath);
  } catch {
    return filePath;
  }
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/** Lee el .json gemelo (<stem>.json) junto a un .mp4 o imagen en Inbox\. */
export function readSidecarMeta(fileAbsPath: string): SidecarMediaMeta {
  const dir = path.dirname(fileAbsPath);
  const stem = path.basename(fileAbsPath, path.extname(fileAbsPath));
  const jsonPath = path.join(dir, `${stem}.json`);
  if (!fs.existsSync(jsonPath)) {
    return { title: null, caption: null, meta_json: null };
  }
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { title: null, caption: null, meta_json: null };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      title: firstNonEmptyString(obj.title, obj.titulo),
      caption: firstNonEmptyString(
        obj.caption,
        obj.copy,
        obj.descripcion,
        obj.description,
        obj.text
      ),
      meta_json: JSON.stringify(obj),
    };
  } catch {
    return { title: null, caption: null, meta_json: null };
  }
}

/** Si el .json llega después del .mp4, actualiza título/caption del media ya indexado. */
export function applySidecarForJson(db: Database.Database, jsonAbsPath: string): number {
  const meta = readSidecarMeta(jsonAbsPath);
  if (!meta.meta_json) return 0;

  const dir = path.dirname(jsonAbsPath);
  const stem = path.basename(jsonAbsPath, path.extname(jsonAbsPath));
  let updated = 0;

  for (const ext of [...VIDEO_EXT, ...IMAGE_EXT]) {
    const candidate = normalizeMediaPath(path.join(dir, `${stem}${ext}`));
    if (countMediaRowsWithPath(db, candidate) > 0) {
      updated += updateMediaMetadataByPath(db, candidate, meta);
    }
  }
  return updated;
}

export function startInboxWatcher(db: Database.Database, inboxDir: string): () => void {
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

  /** Evita carrera add/add: dos inserts del mismo path con UUID distinto. */
  const indexing = new Set<string>();

  const indexFile = (rawPath: string) => {
    const absPath = normalizeMediaPath(rawPath);
    const ext = path.extname(absPath).toLowerCase();

    if (ext === ".json") {
      const updated = applySidecarForJson(db, absPath);
      if (updated > 0) {
        log(db, "info", `Inbox: metadatos .json aplicados (${path.basename(absPath)})`);
      }
      return;
    }

    if (!shouldIndexInboxFile(absPath)) return;

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
      const sidecar = readSidecarMeta(absPath);
      const id = crypto.randomUUID();
      insertMedia(db, {
        id,
        path: absPath,
        kind,
        width: null,
        height: null,
        duration_ms: null,
        public_url: null,
        title: sidecar.title,
        caption: sidecar.caption,
        meta_json: sidecar.meta_json,
        created_at: Math.floor(Date.now() / 1000),
      });
      const extra = sidecar.title ? ` — "${sidecar.title}"` : "";
      log(db, "info", `Inbox: indexado ${path.basename(absPath)} (${kind})${extra}`);
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
  watcher.on("change", (rawPath) => {
    if (path.extname(rawPath).toLowerCase() === ".json") {
      indexFile(rawPath);
    }
  });
  return () => watcher.close();
}
