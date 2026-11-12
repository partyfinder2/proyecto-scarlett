import { exec, execFile, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {
  removeWatermarkFromFile,
  resolvePresetKey,
  type WatermarkMode,
} from "./watermarkRemover";
import { resolveYtDlpCookieArgs } from "./ytDlpCookies";
import { cleanupYtdlpFragments } from "./inboxMediaFilter";
import os from "node:os";

export type NetworkKey = "tiktok" | "instagram" | "youtube" | "facebook" | "twitter";

export interface NetworkInfo {
  key: NetworkKey;
  name: string;
}

export interface ProgressPayload {
  percent: number;
  text: string;
  network: string;
  url: string;
}

export interface DownloadOptions {
  url: string;
  /** Solo para dataDir relativo / legacy; el MP4 va a Descargas. */
  inboxDir: string;
  onProgress?: (progress: ProgressPayload) => void;
  /** Tras descargar, pipeline anti-marca de agua. */
  removeWatermarkMode?: WatermarkMode;
  /** @deprecated usar removeWatermarkMode */
  removeWatermark?: boolean;
  dataDir?: string;
}

/** Carpeta Descargas del usuario de Windows que esté usando la app. */
export function userDownloadsDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, "Downloads");
}

function uniqueMp4Path(dir: string, filename: string): string {
  const dest = path.join(dir, filename);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  let n = 2;
  while (fs.existsSync(path.join(dir, `${base}-${n}${ext}`))) n += 1;
  return path.join(dir, `${base}-${n}${ext}`);
}

export interface DownloadResult {
  ok: boolean;
  filePath?: string;
  network?: string;
  error?: string;
  ytDlpMissing?: boolean;
  watermarkRemoved?: boolean;
  watermarkMode?: WatermarkMode;
  /** Descarga OK; la anti-marca sigue en segundo plano (UI ya puede pedir otra URL). */
  watermarkPending?: boolean;
  /** Descarga OK pero ffmpeg/IA no pudo quitar marca. */
  watermarkWarning?: string;
}

/**
 * Detecta la red social basada en la URL.
 */
export function detectNetwork(url: string): NetworkInfo | null {
  if (!url || typeof url !== "string") return null;
  const clean = url.trim().toLowerCase();

  if (/youtube\.com|youtu\.be/.test(clean)) {
    return { key: "youtube", name: "YouTube" };
  }
  if (/tiktok\.com/.test(clean)) {
    return { key: "tiktok", name: "TikTok" };
  }
  if (/instagram\.com|instagr\.am/.test(clean)) {
    return { key: "instagram", name: "Instagram" };
  }
  if (/facebook\.com|fb\.watch|fb\.com/.test(clean)) {
    return { key: "facebook", name: "Facebook" };
  }
  if (/twitter\.com|x\.com/.test(clean)) {
    return { key: "twitter", name: "X / Twitter" };
  }

  return null;
}

/**
 * Verifica si yt-dlp está instalado y accesible en PATH.
 */
export function checkYtDlpAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("yt-dlp --version", (error, stdout) => {
      if (error || !stdout || !stdout.trim()) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Genera un nombre limpio para el archivo:
 * [red]-[id o título corto]-[fecha].mp4
 */
export function cleanFilename(networkKey: string, titleOrId: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  let cleanStr = (titleOrId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-zA-Z0-9_\-]/g, "-") // Reemplazar no alfanuméricos por guion
    .replace(/-+/g, "-") // Remover guiones duplicados
    .replace(/^-|-$/g, "") // Quitar guiones inicio/fin
    .slice(0, 30); // Limitar a 30 caracteres

  if (!cleanStr) {
    cleanStr = "video";
  }

  return `${networkKey}-${cleanStr}-${dateStr}.mp4`;
}

/**
 * Mapea mensajes de error de yt-dlp / proceso a mensajes amigables en español.
 */
export function parseYtDlpError(errText: string): string {
  if (!errText) return "Error desconocido al descargar el video.";
  const text = errText.toLowerCase();

  if (
    text.includes("private video") ||
    text.includes("video unavailable") ||
    text.includes("this video has been removed") ||
    text.includes("content unavailable") ||
    text.includes("not available")
  ) {
    return "El video es privado o fue eliminado.";
  }
  if (
    text.includes("unable to download webpage") ||
    text.includes("enotfound") ||
    text.includes("name or service not known") ||
    text.includes("connection refused") ||
    text.includes("http error 404") ||
    text.includes("network error") ||
    text.includes("timed out")
  ) {
    return "Sin conexión a internet o error de red.";
  }
  if (
    text.includes("available to everyone") ||
    text.includes("certain audiences") ||
    text.includes("empty media response")
  ) {
    return (
      "Instagram limitó este reel (edad o audiencia). yt-dlp sin sesión no puede bajarlo. " +
      "Si lo ves en el navegador con tu cuenta, exporta cookies Netscape a data/cookies.txt y reintenta."
    );
  }
  if (
    text.includes("could not copy") &&
    (text.includes("cookie") || text.includes("chrome"))
  ) {
    return (
      "Chrome bloquea la copia de cookies (suele estar abierto o en segundo plano). " +
      "Administrador de tareas → finaliza todos los chrome.exe → Descargar sin abrir Chrome. " +
      "Si sigue: exporta data/cookies.txt (extensión Get cookies.txt LOCALLY) — ver docs/YTDLP_COOKIES.md."
    );
  }
  if (
    text.includes("sign in to confirm your age") ||
    text.includes("age-gated") ||
    text.includes("drm protected") ||
    text.includes("requires authentication") ||
    text.includes("this video is restricted")
  ) {
    return (
      "Video con edad/login o DRM. Activa sesión: .env → YTDLP_COOKIES_FROM_BROWSER=chrome " +
      "(cierra Chrome y reintenta) o data/cookies.txt — ver docs/YTDLP_COOKIES.md. " +
      "Alternativa: guarda el .mp4 en Inbox/ a mano."
    );
  }

  const firstLine = errText.split("\n").find((line) => line.trim().startsWith("ERROR:")) || errText.slice(0, 150);
  return `Error en la descarga: ${firstLine.trim() || errText.trim()}`;
}

/**
 * Descarga el video utilizando yt-dlp.
 */
export async function downloadVideo(opts: DownloadOptions): Promise<DownloadResult> {
  const { url, inboxDir, onProgress } = opts;

  if (!url || !url.trim()) {
    return { ok: false, error: "Por favor ingresa una URL." };
  }

  const netInfo = detectNetwork(url);
  if (!netInfo) {
    return { ok: false, error: "URL inválida o red no soportada (soporta TikTok, Instagram, YouTube, Facebook y X)." };
  }

  const isYtDlpInstalled = await checkYtDlpAvailable();
  if (!isYtDlpInstalled) {
    return {
      ok: false,
      ytDlpMissing: true,
      error: "yt-dlp no está instalado o no está en el PATH.",
    };
  }

  const downloadsDir = userDownloadsDir();
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  let titleOrId = "";

  const dataDir = opts.dataDir ?? path.join(inboxDir, "..", "data");
  const cookiesArgs = resolveYtDlpCookieArgs(dataDir);

  // Intentar obtener metadata básica con --dump-json
  try {
    const metaJson = await new Promise<string>((resolve, reject) => {
      execFile(
        "yt-dlp",
        ["--no-playlist", "--dump-json", ...cookiesArgs, url.trim()],
        { maxBuffer: 20 * 1024 * 1024 },
        (error, stdout) => {
          if (error || !stdout) {
            reject(error || new Error("No stdout"));
          } else {
            resolve(stdout);
          }
        }
      );
    });

    const parsed = JSON.parse(metaJson);
    titleOrId = parsed.title || parsed.id || "";
  } catch (_e) {
    // Fallback: usar parte final de URL si falla --dump-json
    titleOrId = url.trim().split("/").pop() || "video";
  }

  const filename = cleanFilename(netInfo.key, titleOrId);
  const targetFilePath = uniqueMp4Path(downloadsDir, filename);
  const finalFilename = path.basename(targetFilePath);

  // Seleccionar formato óptimo:
  // YouTube (corto y largo): 1080p mp4 (o mejor disponible si < 1080p)
  // TikTok / IG / FB / X: mejor calidad disponible
  let formatArg = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/bestvideo[height<=1080]+bestaudio/best";
  if (netInfo.key !== "youtube") {
    // Preferir stream sin marca cuando el extractor lo expone (TikTok/IG varía por versión yt-dlp).
    formatArg =
      "bestvideo*[ext=mp4]+bestaudio/bestvideo+bestaudio/best[ext=mp4]/best";
  }

  const ytdlpTempDir = path.join(os.tmpdir(), "babeldesk-ytdlp");
  if (!fs.existsSync(ytdlpTempDir)) fs.mkdirSync(ytdlpTempDir, { recursive: true });

  const ytDlpArgs = [
    "--newline",
    "--no-playlist",
    "-f",
    formatArg,
    "--merge-output-format",
    "mp4",
    "--paths",
    `temp:${ytdlpTempDir}`,
    "-o",
    targetFilePath,
  ];

  ytDlpArgs.push(...cookiesArgs, url.trim());

  return new Promise<DownloadResult>((resolve) => {
    let stderrData = "";
    let stdoutData = "";

    const child = spawn("yt-dlp", ytDlpArgs);

    child.stdout.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      stdoutData += str;

      const lines = str.split("\n");
      for (const line of lines) {
        const match = line.match(/\[download\]\s*([\d\.]+)%/i);
        if (match && onProgress) {
          const percent = parseFloat(match[1]);
          onProgress({
            percent,
            text: line.trim(),
            network: netInfo.key,
            url,
          });
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        error: parseYtDlpError(err.message),
      });
    });

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(targetFilePath)) {
        cleanupYtdlpFragments(downloadsDir, finalFilename);

        const wmMode: WatermarkMode =
          opts.removeWatermarkMode ??
          (opts.removeWatermark ? "standard" : "off");

        if (onProgress) {
          onProgress({
            percent: 100,
            text: "Descarga completada en Descargas.",
            network: netInfo.key,
            url,
          });
        }

        // Desbloquea la UI ahora. La anti-marca (Máximo/IA) no debe trabar la siguiente URL.
        resolve({
          ok: true,
          filePath: targetFilePath,
          network: netInfo.key,
          watermarkRemoved: false,
          watermarkPending: wmMode !== "off",
          watermarkMode: wmMode !== "off" ? wmMode : undefined,
        });

        if (wmMode === "off") return;

        void (async () => {
          if (onProgress) {
            onProgress({
              percent: 100,
              text:
                wmMode === "max"
                  ? "Marca de agua en segundo plano (Máximo)…"
                  : "Marca de agua en segundo plano…",
              network: netInfo.key,
              url,
            });
          }
          try {
            const wm = await removeWatermarkFromFile({
              inputPath: targetFilePath,
              preset: resolvePresetKey(netInfo.key, "auto"),
              mode: wmMode,
              dataDir: opts.dataDir,
            });
            if (onProgress) {
              onProgress({
                percent: 100,
                text: wm.ok
                  ? "Anti-marca lista. Revisa el preview."
                  : `Anti-marca falló (video intacto): ${(wm.error || "").slice(0, 160)}`,
                network: netInfo.key,
                url,
              });
            }
          } catch (err) {
            if (onProgress) {
              onProgress({
                percent: 100,
                text: `Anti-marca falló: ${err instanceof Error ? err.message : String(err)}`.slice(
                  0,
                  200
                ),
                network: netInfo.key,
                url,
              });
            }
          }
        })();
      } else {
        const fullErr = stderrData || stdoutData || `Código de salida ${code}`;
        resolve({
          ok: false,
          error: parseYtDlpError(fullErr),
        });
      }
    });
  });
}
