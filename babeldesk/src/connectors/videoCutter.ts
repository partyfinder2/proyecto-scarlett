import { exec, execFile, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { escapeDrawtext } from "../media/overlay";
import { MIN_INBOX_VIDEO_BYTES } from "./inboxMediaFilter";

const DRAWTEXT_FONT =
  process.platform === "win32"
    ? "C\\\\:/Windows/Fonts/segoeui.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

export interface ClipSpec {
  start: string;   // "mm:ss" or "hh:mm:ss"
  end: string;
  name: string;    // output filename base (no extension)
}

export interface CutOptions {
  sourcePath: string;
  clips: ClipSpec[];
  inboxDir: string;
  vertical?: boolean;   // recortar a 9:16 1080x1920
  hookText?: string;    // texto superpuesto (opcional)
  onProgress?: (msg: string, done: number, total: number) => void;
}

export interface CutResult {
  ok: boolean;
  outputs: string[];
  errors: string[];
  cancelled?: boolean;
}

export const CUT_CANCELLED_MESSAGE = "Proceso cancelado por el usuario.";

let activeChildProcess: ReturnType<typeof spawn> | null = null;
let isCancelled = false;

export function cancelCurrentCut(): void {
  isCancelled = true;
  if (activeChildProcess) {
    try {
      activeChildProcess.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    activeChildProcess = null;
  }
}

export function isCutCancelled(): boolean {
  return isCancelled;
}

/** Verifica si ffmpeg está disponible en PATH */
export function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("ffmpeg -version", (err) => resolve(!err));
  });
}

/** Convierte "ss.d", "m:ss.d" o "h:mm:ss.d" a segundos. */
export function parseTime(t: string): number {
  const parts = t.trim().split(":");
  if (!parts.length) return 0;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return 0;
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return 0;
}

/** Sin 9:16 y sin hook el corte es copia de stream. Cualquier filtro re-codifica. */
export function resolveCutMode(vertical: boolean, hookText?: string): "copy" | "reencode" {
  if (vertical) return "reencode";
  if ((hookText || "").trim()) return "reencode";
  return "copy";
}

/** Obtiene la duración de un video en segundos usando ffprobe */
export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      (err, stdout) => {
        if (err || !stdout) return resolve(0);
        resolve(parseFloat(stdout.trim()) || 0);
      }
    );
  });
}

/** Formatea segundos en mm:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Limpia un nombre de archivo */
function sanitizeName(name: string): string {
  return (name || "clip")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "clip";
}

/** Construye los filtros de ffmpeg para un clip */
export function buildFilterComplex(vertical: boolean, hookText?: string): string {
  const filters: string[] = [];

  if (vertical) {
    // Escala preservando aspect ratio y rellena con blur a 1080x1920
    filters.push(
      "[0:v]split=2[bg][fg]",
      "[bg]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,boxblur=9:2:9:2[bgblurred]",
      "[fg]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fgscaled]",
      "[bgblurred][fgscaled]overlay=(W-w)/2:(H-h)/2[composed]"
    );

    if (hookText) {
      const safeHook = escapeDrawtext(hookText);
      filters.push(
        `[composed]drawtext=fontfile=${DRAWTEXT_FONT}:expansion=none:text='${safeHook}':fontsize=52:fontcolor=white:` +
        `borderw=3:bordercolor=black:x=(w-tw)/2:y=h*0.12[out]`
      );
    } else {
      filters.push("[composed]copy[out]");
    }
  } else if (hookText) {
    const safeHook = escapeDrawtext(hookText);
    filters.push(
      `[0:v]drawtext=fontfile=${DRAWTEXT_FONT}:expansion=none:text='${safeHook}':fontsize=48:fontcolor=white:` +
      `borderw=3:bordercolor=black:x=(w-tw)/2:y=h*0.10[out]`
    );
  }

  return filters.join(";");
}

/** Corta un único clip del video fuente */
async function cutClip(
  sourcePath: string,
  clip: ClipSpec,
  inboxDir: string,
  vertical: boolean,
  hookText?: string
): Promise<string> {
  const startSec = parseTime(clip.start);
  const endSec = parseTime(clip.end);
  const duration = endSec - startSec;

  if (duration <= 0) throw new Error(`Clip ${clip.name}: el fin debe ser mayor al inicio.`);

  const safeName = sanitizeName(clip.name);
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  let outFile = path.join(inboxDir, `clip-${safeName}-${dateStr}.mp4`);
  for (let n = 2; fs.existsSync(outFile); n++) {
    outFile = path.join(inboxDir, `clip-${safeName}-${dateStr}-${n}.mp4`);
  }

  const filterStr =
    resolveCutMode(vertical, hookText) === "copy" ? "" : buildFilterComplex(vertical, hookText);

  const args: string[] = [
    "-y",
    "-ss", String(startSec),
    "-i", sourcePath,
    "-t", String(duration),
  ];

  if (filterStr) {
    args.push("-filter_complex", filterStr, "-map", "[out]", "-map", "0:a?");
  } else {
    args.push("-c:v", "copy", "-c:a", "copy");
  }

  if (filterStr) {
    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "15", "-tune", "film", "-c:a", "aac", "-b:a", "256k");
  }

  args.push("-movflags", "+faststart", outFile);

  return new Promise((resolve, reject) => {
    if (isCancelled) {
      reject(new Error(CUT_CANCELLED_MESSAGE));
      return;
    }
    const child = spawn("ffmpeg", args);
    activeChildProcess = child;
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const dropPartial = () => {
      if (fs.existsSync(outFile)) {
        try {
          fs.unlinkSync(outFile);
        } catch {
          /* ignore */
        }
      }
    };

    child.on("close", (code, signal) => {
      activeChildProcess = null;
      if (isCancelled || signal === "SIGKILL") {
        dropPartial();
        reject(new Error(CUT_CANCELLED_MESSAGE));
        return;
      }
      if (code === 0 && fs.existsSync(outFile)) {
        let size = 0;
        try {
          size = fs.statSync(outFile).size;
        } catch {
          dropPartial();
          reject(new Error("No se pudo leer el clip generado."));
          return;
        }
        if (size < MIN_INBOX_VIDEO_BYTES) {
          dropPartial();
          reject(new Error("Clip vacío o corrupto (ffmpeg abortó a medias)."));
          return;
        }
        resolve(outFile);
      } else {
        dropPartial();
        const msg =
          stderr.split("\n").filter((l) => l.includes("Error") || l.includes("error")).pop() ||
          `ffmpeg exit ${code}`;
        reject(new Error(msg));
      }
    });
    child.on("error", (err) => {
      activeChildProcess = null;
      reject(err);
    });
  });
}

/** Corta todos los clips en secuencia */
export async function cutAllClips(opts: CutOptions): Promise<CutResult> {
  const { sourcePath, clips, inboxDir, vertical = true, hookText, onProgress } = opts;
  isCancelled = false;
  activeChildProcess = null;

  if (!fs.existsSync(sourcePath)) {
    return { ok: false, outputs: [], errors: [`Archivo fuente no encontrado: ${sourcePath}`] };
  }
  if (!clips.length) {
    return { ok: false, outputs: [], errors: ["No hay clips definidos."] };
  }
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  const outputs: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    if (isCancelled) {
      if (!errors.includes(CUT_CANCELLED_MESSAGE)) errors.push(CUT_CANCELLED_MESSAGE);
      break;
    }
    const clip = clips[i];
    onProgress?.(`Cortando clip ${i + 1}/${clips.length}: ${clip.name}…`, i, clips.length);
    try {
      const out = await cutClip(sourcePath, clip, inboxDir, vertical, hookText);
      outputs.push(out);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === CUT_CANCELLED_MESSAGE || isCancelled) {
        if (!errors.includes(CUT_CANCELLED_MESSAGE)) errors.push(CUT_CANCELLED_MESSAGE);
        break;
      }
      errors.push(`Clip ${clip.name}: ${msg}`);
    }
  }

  const cancelled = isCancelled;
  if (cancelled) {
    onProgress?.("Cancelado", outputs.length, clips.length);
  } else {
    onProgress?.("¡Listo!", clips.length, clips.length);
  }
  return { ok: !cancelled && errors.length === 0, outputs, errors, cancelled };
}
