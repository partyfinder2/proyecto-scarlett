import { spawn } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import type { IpcMain, BrowserWindow } from "electron";
import { exportReel, checkFfmpeg } from "../media/overlay";
import { fetchWeekPlan } from "../plan/weekPlan";
import { getOpenRouterCredentials } from "./openrouter-config";
import { checkYtDlpAvailable, detectNetwork, downloadVideo } from "../connectors/downloader";
import { resolveYtDlpCookieArgs } from "../connectors/ytDlpCookies";
import {
  removeWatermarkFromFile,
  resolvePresetKey,
  type WatermarkPresetKey,
} from "../connectors/watermarkRemover";
import {
  checkFfmpegAvailable,
  getVideoDuration,
  formatDuration,
  cutAllClips,
  cancelCurrentCut,
  type ClipSpec,
} from "../connectors/videoCutter";
import { countMediaRowsWithPath, insertMedia, log, openDb } from "./db";

type YtChapterRaw = { title?: string; start_time: number; end_time?: number };

function normalizeYoutubeChapters(
  raw: YtChapterRaw[],
  durationSec: number
): Array<{ title: string; start_time: number; end_time: number }> {
  const out: Array<{ title: string; start_time: number; end_time: number }> = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const start = Number(ch.start_time);
    if (!Number.isFinite(start) || start < 0) continue;
    let end = ch.end_time != null ? Number(ch.end_time) : NaN;
    if (!Number.isFinite(end) || end <= start) {
      end = i + 1 < raw.length ? Number(raw[i + 1].start_time) : durationSec;
    }
    if (!Number.isFinite(end) || end <= start) continue;
    out.push({
      title: (ch.title || `capitulo-${i + 1}`).trim(),
      start_time: start,
      end_time: Math.min(end, durationSec > 0 ? durationSec : end),
    });
  }
  return out;
}

export function registerTanda13Handlers(ipcMain: IpcMain, dataDir: string): void {
  ipcMain.handle("overlay:export", async (_event, opts) => exportReel(opts));

  ipcMain.handle("overlay:checkFfmpeg", async () => {
    const available = await checkFfmpeg();
    return { available };
  });

  ipcMain.handle("plan:week", async () => {
    const creds = getOpenRouterCredentials(dataDir);
    if (!creds) {
      return {
        ok: false,
        error: "OpenRouter API key is not configured. Go to Ajustes to add it.",
      };
    }
    return fetchWeekPlan(creds.apiKey, creds.model);
  });
}

export function registerDownloaderHandlers(
  ipcMain: IpcMain,
  inboxDir: string,
  dataDir: string,
  getMainWindow: () => BrowserWindow | null
): void {
  /** Una sola descarga a la vez (doble clic / Enter+submit). */
  let downloadBusy = false;

  ipcMain.handle("downloader:checkYtDlp", async () => {
    const available = await checkYtDlpAvailable();
    return { available };
  });

  ipcMain.handle("downloader:detectNetwork", (_event, url: string) => {
    return detectNetwork(url);
  });

  ipcMain.handle(
    "downloader:download",
    async (
      _event,
      payload:
        | string
        | { url: string; removeWatermark?: boolean; removeWatermarkMode?: "off" | "standard" | "max" }
    ) => {
      if (downloadBusy) {
        return {
          ok: false,
          error: "Ya hay una descarga en curso. Espera a que termine antes de pegar la siguiente URL.",
        };
      }
      const url = typeof payload === "string" ? payload : payload.url;
      const removeWatermarkMode =
        typeof payload === "object" && payload !== null
          ? payload.removeWatermarkMode ??
            (payload.removeWatermark ? "standard" : "off")
          : "off";
      const win = getMainWindow();
      downloadBusy = true;
      try {
        const result = await downloadVideo({
          url,
          inboxDir,
          removeWatermarkMode,
          dataDir,
          onProgress: (p) => {
            win?.webContents.send("downloader:progress", p);
          },
        });
        // Mis Videos indexa Descargas (ya no cae en Inbox/ del watcher).
        if (result.ok && result.filePath) {
          try {
            const db = openDb();
            const abs = path.resolve(result.filePath);
            if (countMediaRowsWithPath(db, abs) === 0) {
              insertMedia(db, {
                id: crypto.randomUUID(),
                path: abs,
                kind: "video",
                width: null,
                height: null,
                duration_ms: null,
                public_url: null,
                created_at: Math.floor(Date.now() / 1000),
              });
              log(db, "info", `Descargas: indexado ${path.basename(abs)}`);
            }
          } catch {
            /* la UI igual refresca; el archivo ya está en Descargas */
          }
        }
        return result;
      } finally {
        downloadBusy = false;
      }
    }
  );
}

export function registerWatermarkHandlers(
  ipcMain: IpcMain,
  dataDir: string,
  getMediaById: (id: string) => { path: string; kind: string } | null
): void {
  ipcMain.handle(
    "watermark:remove",
    async (
      _event,
      opts: {
        mediaId: string;
        preset?: WatermarkPresetKey | "auto";
        networkHint?: string;
        mode?: "off" | "standard" | "max";
      }
    ) => {
      const row = getMediaById(opts.mediaId);
      if (!row) return { ok: false, error: "Video no encontrado." };
      if (row.kind !== "video") return { ok: false, error: "Solo aplica a videos." };
      const preset =
        opts.preset && opts.preset !== "auto"
          ? opts.preset
          : resolvePresetKey(opts.networkHint, "auto");
      return removeWatermarkFromFile({
        inputPath: row.path,
        preset,
        mode: opts.mode ?? "max",
        dataDir,
      });
    }
  );
}

export function registerCutterHandlers(
  ipcMain: IpcMain,
  inboxDir: string,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle("cutter:checkFfmpeg", async () => {
    const available = await checkFfmpegAvailable();
    return { available };
  });

  ipcMain.handle("cutter:getDuration", async (_event, filePath: string) => {
    const seconds = await getVideoDuration(filePath);
    return { seconds, formatted: formatDuration(seconds) };
  });

  ipcMain.handle(
    "cutter:cut",
    async (
      _event,
      opts: {
        sourcePath: string;
        clips: ClipSpec[];
        vertical: boolean;
        hookText?: string;
      }
    ) => {
      const win = getMainWindow();
      const result = await cutAllClips({
        sourcePath: opts.sourcePath,
        clips: opts.clips,
        inboxDir,
        vertical: opts.vertical,
        hookText: opts.hookText || undefined,
        onProgress: (msg, done, total) => {
          win?.webContents.send("cutter:progress", { msg, done, total });
        },
      });
      return result;
    }
  );

  ipcMain.handle("cutter:cancel", async () => {
    cancelCurrentCut();
    return { ok: true };
  });

  ipcMain.handle("cutter:getYoutubeChapters", async (_event, url: string) => {
    const trimmed = (url || "").trim();
    if (!trimmed) {
      return { ok: false, error: "Pega la URL del video de YouTube." };
    }
    const net = detectNetwork(trimmed);
    if (net?.key !== "youtube") {
      return { ok: false, error: "Solo URLs de YouTube (watch o youtu.be)." };
    }

    const dataDir = path.join(inboxDir, "..", "data");
    const args = ["--dump-json", "--no-download", ...resolveYtDlpCookieArgs(dataDir), trimmed];

    return new Promise<{
      ok: boolean;
      chapters?: Array<{ title: string; start_time: number; end_time: number }>;
      error?: string;
    }>((resolve) => {
      const child = spawn("yt-dlp", args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", () => {
        resolve({ ok: false, error: "yt-dlp no está disponible en PATH." });
      });
      child.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          const hint = stderr.includes("Sign in")
            ? " Ver docs/YTDLP_COOKIES.md (YTDLP_COOKIES_FROM_BROWSER o data/cookies.txt)."
            : "";
          return resolve({
            ok: false,
            error: `No se pudo leer el video. Verifica la URL.${hint}`,
          });
        }
        try {
          const info = JSON.parse(stdout) as {
            chapters?: YtChapterRaw[];
            duration?: number;
          };
          const durationSec = Number(info.duration) || 0;
          const chapters = normalizeYoutubeChapters(info.chapters ?? [], durationSec);
          if (!chapters.length) {
            return resolve({
              ok: false,
              error: "Este video no tiene capítulos. Usa el auto-corte por intervalo.",
            });
          }
          resolve({ ok: true, chapters });
        } catch {
          resolve({ ok: false, error: "Error al leer los metadatos del video." });
        }
      });
    });
  });
}
