import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import {
  isInboxTempOrFragment,
  isInboxVideoTooSmall,
  shouldIndexInboxFile,
} from "../connectors/inboxMediaFilter";
import { deleteMediaRow, listMedia, log } from "./db";

/** Quita de la biblioteca (y del disco) basura: temporales, 0 bytes, cortes abortados. */
export function pruneInboxMediaLibrary(db: Database.Database): {
  removedRows: number;
  deletedFiles: number;
} {
  let removedRows = 0;
  let deletedFiles = 0;

  for (const m of listMedia(db)) {
    const p = m.path;
    const base = path.basename(p);
    let reason: string | null = null;

    if (!fs.existsSync(p)) reason = "archivo_faltante";
    else if (isInboxTempOrFragment(p)) reason = "temporal";
    else if (m.kind === "video" && isInboxVideoTooSmall(p)) reason = "video_muy_pequeno";

    if (!reason) continue;

    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        deletedFiles++;
      } catch {
        /* sigue: al menos sacar de la DB */
      }
    }
    deleteMediaRow(db, m.id);
    removedRows++;
    log(db, "info", `Inbox: purgado ${base} (${reason})`);
  }

  return { removedRows, deletedFiles };
}

/** Borra archivos basura sueltos en Inbox/ que no deberían indexarse. */
export function sweepInboxDirectory(inboxDir: string): number {
  if (!fs.existsSync(inboxDir)) return 0;
  let deleted = 0;
  for (const name of fs.readdirSync(inboxDir)) {
    const full = path.join(inboxDir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (shouldIndexInboxFile(full)) continue;
    try {
      fs.unlinkSync(full);
      deleted++;
    } catch {
      /* ignore */
    }
  }
  return deleted;
}
