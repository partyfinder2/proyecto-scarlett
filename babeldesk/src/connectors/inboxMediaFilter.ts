import fs from "node:fs";
import path from "node:path";

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);

/** Videos rotos / cortes abortados (tarjeta negra en la UI). */
export const MIN_INBOX_VIDEO_BYTES = 48_000;

/** Archivos temporales de yt-dlp / ffmpeg que no deben indexarse en Mis Videos. */
export function isInboxTempOrFragment(filePath: string): boolean {
  const base = path.basename(filePath);
  if (/\.f\d+\.(mp4|webm|mkv|m4a|mp3|opus)/i.test(base)) return true;
  if (/\.part$/i.test(base)) return true;
  if (/\.ytdl$/i.test(base)) return true;
  if (/\.__nowm\./i.test(base)) return true;
  if (/\.delogo-\d+\.mp4$/i.test(base)) return true;
  return false;
}

export function isInboxVideoTooSmall(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.size < MIN_INBOX_VIDEO_BYTES;
  } catch {
    return true;
  }
}

/** ¿Indexar este archivo en Mis Videos? */
export function shouldIndexInboxFile(filePath: string): boolean {
  if (isInboxTempOrFragment(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXT.has(ext) && isInboxVideoTooSmall(filePath)) return false;
  return true;
}

/** Borra restos yt-dlp (p. ej. video.f399.mp4) tras merge exitoso a video.mp4 */
export function cleanupYtdlpFragments(inboxDir: string, finalFilename: string): number {
  const stem = finalFilename.replace(/\.mp4$/i, "");
  let removed = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(inboxDir);
  } catch {
    return 0;
  }
  for (const f of entries) {
    if (f === finalFilename) continue;
    if (!f.startsWith(stem)) continue;
    if (!/\.f\d+\./i.test(f)) continue;
    try {
      fs.unlinkSync(path.join(inboxDir, f));
      removed++;
    } catch {
      /* ignore */
    }
  }
  return removed;
}
